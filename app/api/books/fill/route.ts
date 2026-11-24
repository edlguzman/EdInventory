import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getDataLang } from "@/lib/auth";
import type { FillAnswer, FillProposal } from "@/lib/books/fill-types";
import { lookupIsbnStatus, searchByTitle } from "@/lib/books/lookup";
import { pickCandidate } from "@/lib/books/match";
import { catalogueRateLimited } from "@/lib/books/rate-limit";
import { ownLocal } from "@/lib/data-lang";
import { createClient } from "@/lib/supabase/server";

/** Two catalogues, up to two requests each, fit into this. */
export const maxDuration = 30;

const bodySchema = z.object({ id: z.uuid() });

const answer = (a: FillAnswer) => NextResponse.json(a);

/**
 * "Complete book data" for one item: by its ISBN (Open Library / Google Books), else by its
 * title and author (Google Books). Not AI: no quota. The client sends only the id, the server
 * reads the item under RLS; the ISBN, or the title and author, leave the server — nothing else.
 * Proposes values for EMPTY fields only; nothing is written here.
 */
export async function POST(request: NextRequest) {
  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "badRequest" }, { status: 400 });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { data: active } = await supabase.rpc("is_active");
  if (!active) return NextResponse.json({ error: "accountInactive" }, { status: 403 });
  // Our own brake: the client waits and repeats, as when a catalogue is busy.
  if (catalogueRateLimited(user.id)) return answer({ status: "busy" });

  const { data: item } = await supabase
    .from("items")
    .select("id, lang, name_local, name_en, book_author, book_year, book_isbn, item_photos(id)")
    .eq("id", body.data.id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!item) return answer({ status: "nothing" }); // deleted meanwhile

  const { lang } = await getDataLang();
  const noPhoto = item.item_photos.length === 0;
  const base = {
    id: item.id,
    nameLocal: ownLocal(item.lang, lang, item.name_local),
    nameEn: item.name_en,
    currentAuthor: item.book_author,
  };
  /** Only what the item lacks. */
  const emptyOnly = (v: { author: string | null; year: number | null; isbn: string | null; nameEn: string | null }) => {
    const values: FillProposal["values"] = {};
    if (!item.book_author && v.author) values.author = v.author;
    if (!item.book_year && v.year) values.year = v.year;
    if (!item.book_isbn && v.isbn) values.isbn = v.isbn;
    if (!item.name_en && v.nameEn) values.nameEn = v.nameEn;
    return values;
  };
  const reply = (p: FillProposal) => answer(Object.keys(p.values).length || p.coverIsbn ? { status: "found", proposal: p } : { status: "nothing" });

  if (item.book_isbn) {
    const { book, busy } = await lookupIsbnStatus(item.book_isbn);
    if (busy) return answer({ status: "busy" });
    return reply({
      ...base,
      source: "isbn",
      exact: true,
      foundTitle: book?.title ?? null,
      foundAuthor: book?.author ?? null,
      values: book ? emptyOnly({ author: book.author, year: book.year, isbn: null, nameEn: book.titleEn }) : {},
      coverIsbn: noPhoto ? item.book_isbn : null,
    });
  }

  const title = (item.name_local ?? item.name_en ?? "").trim();
  if (!title) return answer({ status: "nothing" });
  const found = await searchByTitle(title, item.book_author);
  if (found.busy) return answer({ status: "busy" });
  const best = pickCandidate({ title, author: item.book_author }, found.candidates);
  if (!best) return answer({ status: "nothing" });
  const c = best.candidate;
  const foundAuthor = c.authors.join(", ").slice(0, 300) || null;
  return reply({
    ...base,
    source: "title",
    exact: best.exact,
    foundTitle: [c.title, c.subtitle].filter(Boolean).join(". "),
    foundAuthor,
    values: emptyOnly({ author: foundAuthor, year: c.year, isbn: c.isbn, nameEn: c.language === "en" ? c.title : null }),
    coverIsbn: noPhoto ? c.isbn : null,
  });
}
