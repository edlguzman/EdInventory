import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { findCover } from "@/lib/books/cover";
import { normalizeIsbn } from "@/lib/books/isbn";
import { catalogueRateLimited } from "@/lib/books/rate-limit";
import { createClient } from "@/lib/supabase/server";

/** Downloads from two catalogues fit into this. */
export const maxDuration = 30;

const bodySchema = z.object({ isbn: z.string().min(10).max(20) });

/**
 * ISBN -> the biggest cover picture of Google Books / Open Library, as image bytes (checked by
 * the server: catalogue hosts only, type by content, size and time limits). Not AI: no quota.
 * Signed-in active accounts only. The phone compresses it like a photo; nothing is stored here.
 */
export async function POST(request: NextRequest) {
  const body = bodySchema.safeParse(await request.json().catch(() => null));
  const isbn = body.success ? normalizeIsbn(body.data.isbn) : null;
  if (!isbn) return NextResponse.json({ error: "badRequest" }, { status: 400 });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { data: active } = await supabase.rpc("is_active");
  if (!active) return NextResponse.json({ error: "accountInactive" }, { status: 403 });
  if (catalogueRateLimited(user.id)) return NextResponse.json({ error: "rateLimited" }, { status: 429 });

  const cover = await findCover(isbn);
  if (!cover) return NextResponse.json({ error: "notFound" }, { status: 404 });
  return new NextResponse(cover.bytes as unknown as BodyInit, {
    headers: {
      "Content-Type": cover.type,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "X-Cover-Source": cover.source,
    },
  });
}
