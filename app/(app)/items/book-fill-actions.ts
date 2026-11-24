"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { BulkError, BulkResult } from "./bulk-actions";
import { getUser } from "@/lib/auth";
import type { FilledItem } from "@/lib/books/fill-types";
import { BOOK_AUTHOR_MAX, BOOK_YEAR_MAX, BOOK_YEAR_MIN, normalizeIsbn } from "@/lib/books/isbn";
import { kindCategoryIds } from "@/lib/items/kind-filter";
import { isOwnPhotoPath, PHOTO_BUCKET, photoFiles } from "@/lib/photos/paths";
import type { TablesUpdate } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";
import { ITEM_NAME_MAX } from "@/lib/validation/items";

/**
 * "Complete book data" (v2.3.0): which selected items are books with something to fill, writing
 * what the user ticked into EMPTY fields only, adding a cover to a book without photos, undo.
 * As in the other bulk actions: signed-in active account, zod, RLS plus user_id in every query.
 */

const MAX = 500;
const CHUNK = 100;
/** Single-row updates at a time (each item gets its own values). */
const PARALLEL = 6;

type Supabase = Awaited<ReturnType<typeof createClient>>;
type Session = { supabase: Supabase; userId: string };

async function session(): Promise<Session | BulkError> {
  const user = await getUser();
  if (!user) return "unauthorized";
  const supabase = await createClient();
  const { data: active } = await supabase.rpc("is_active");
  if (!active) return "accountInactive";
  return { supabase, userId: user.id };
}

const fail = (error: BulkError): { ok: false; error: BulkError } => ({ ok: false, error });
const chunks = <T,>(list: T[]) => Array.from({ length: Math.ceil(list.length / CHUNK) }, (_, i) => list.slice(i * CHUNK, (i + 1) * CHUNK));

async function pool<T>(list: T[], work: (x: T) => Promise<void>) {
  let next = 0;
  const worker = async () => {
    while (next < list.length) await work(list[next++]);
  };
  await Promise.all(Array.from({ length: Math.min(PARALLEL, list.length) }, worker));
}

const idsSchema = z.array(z.uuid()).min(1).max(MAX);

/** Books among the selected items that lack something (those with an ISBN first), and the rest counted. */
export async function bookFillTargets(input: { ids: string[] }): Promise<BulkResult<{ ids: string[]; complete: number; others: number }>> {
  const ids = idsSchema.safeParse(input.ids);
  if (!ids.success) return fail("invalid");
  const s = await session();
  if (typeof s === "string") return fail(s);

  const { data: categories, error: categoriesError } = await s.supabase.from("categories").select("id, name_local, name_en").eq("user_id", s.userId);
  if (categoriesError) return fail("unknown");
  const bookCategories = new Set(kindCategoryIds(categories, "book"));

  const withIsbn: string[] = [];
  const without: string[] = [];
  let complete = 0;
  let others = 0;
  for (const part of chunks([...new Set(ids.data)])) {
    const { data, error } = await s.supabase
      .from("items")
      .select("id, kind, category_id, name_en, book_author, book_year, book_isbn, item_photos(id)")
      .in("id", part)
      .eq("user_id", s.userId);
    if (error) return fail("unknown");
    for (const i of data) {
      const book = i.kind === "book" || (i.kind === "item" && i.category_id !== null && bookCategories.has(i.category_id));
      if (!book) others++;
      else if (i.book_author && i.book_year && i.book_isbn && i.name_en && i.item_photos.length > 0) complete++;
      else (i.book_isbn ? withIsbn : without).push(i.id);
    }
  }
  return { ok: true, data: { ids: [...withIsbn, ...without], complete, others } };
}

const valuesSchema = z.object({
  author: z.string().trim().min(1).max(BOOK_AUTHOR_MAX).optional(),
  year: z.number().int().min(BOOK_YEAR_MIN).max(BOOK_YEAR_MAX).optional(),
  isbn: z
    .string()
    .max(20)
    .transform((v) => normalizeIsbn(v))
    .refine((v) => v !== null)
    .optional(),
  nameEn: z.string().trim().min(1).max(ITEM_NAME_MAX).optional(),
});

const COLUMN = { author: "book_author", year: "book_year", isbn: "book_isbn", nameEn: "name_en" } as const;
type Key = keyof typeof COLUMN;
const KEYS = Object.keys(COLUMN) as Key[];

const changesSchema = z.array(z.object({ id: z.uuid(), values: valuesSchema })).min(1).max(MAX);

/**
 * Writes the ticked values. Every field is written only where it is still empty (checked by the
 * database in the same update), so an edit made meanwhile is never overwritten. An item that was
 * only in the Books category becomes a book; a medicine is never touched.
 */
export async function applyBookFill(input: z.input<typeof changesSchema>): Promise<BulkResult<{ items: FilledItem[] }>> {
  const parsed = changesSchema.safeParse(input);
  if (!parsed.success) return fail("invalid");
  const s = await session();
  if (typeof s === "string") return fail(s);

  const items: FilledItem[] = [];
  let failed = false;
  await pool(parsed.data, async ({ id, values }) => {
    const done: FilledItem = { id, set: {}, becameBook: false };
    for (const key of KEYS) {
      const value = values[key];
      if (value === undefined || value === null) continue;
      const patch = { [COLUMN[key]]: value } as TablesUpdate<"items">;
      const { data, error } = await s.supabase
        .from("items")
        .update(patch)
        .eq("id", id)
        .eq("user_id", s.userId)
        .neq("kind", "medicine")
        .is(COLUMN[key], null)
        .select("id");
      if (error) failed = true;
      else if (data.length) Object.assign(done.set, { [key]: value });
    }
    // Book data makes it a book; an English title alone does not.
    if (done.set.author || done.set.year || done.set.isbn) {
      const { data } = await s.supabase.from("items").update({ kind: "book" }).eq("id", id).eq("user_id", s.userId).eq("kind", "item").select("id");
      done.becameBook = !!data?.length;
    }
    if (Object.keys(done.set).length) items.push(done);
  });
  if (failed && items.length === 0) return fail("unknown");
  revalidatePath("/", "layout");
  return { ok: true, data: { items } };
}

const coverSchema = z.object({ id: z.uuid(), path: z.string().max(300) });

/**
 * A catalogue cover the client has compressed and uploaded becomes the main photo — only if the
 * book still has no photo at all. Otherwise (or on an error) the uploaded files are removed.
 */
export async function addBookCover(input: z.input<typeof coverSchema>): Promise<BulkResult<{ added: boolean }>> {
  const v = coverSchema.safeParse(input);
  if (!v.success) return fail("invalid");
  const s = await session();
  if (typeof s === "string") return fail(s);
  if (!isOwnPhotoPath(v.data.path, s.userId, v.data.id)) return fail("invalid");

  const { count, error: countError } = await s.supabase
    .from("item_photos")
    .select("id", { count: "exact", head: true })
    .eq("item_id", v.data.id)
    .eq("user_id", s.userId);
  if (!countError && count === 0) {
    // The composite key refuses an item that is not the caller's; one primary photo per item.
    const { error } = await s.supabase.from("item_photos").insert({ item_id: v.data.id, storage_path: v.data.path, is_primary: true });
    if (!error) return { ok: true, data: { added: true } };
  }
  await s.supabase.storage.from(PHOTO_BUCKET).remove(photoFiles(v.data.path));
  return { ok: true, data: { added: false } };
}

const undoSchema = z
  .array(z.object({ id: z.uuid(), set: valuesSchema, becameBook: z.boolean(), cover: z.string().max(300).optional() }))
  .min(1)
  .max(MAX);

/**
 * "Undo": a field is emptied only while it still holds the value that was filled in; an added
 * cover is removed with its files; an item that became a book goes back to a plain item if no
 * book data is left.
 */
export async function undoBookFill(input: z.input<typeof undoSchema>): Promise<BulkResult<{ restored: number }>> {
  const parsed = undoSchema.safeParse(input);
  if (!parsed.success) return fail("invalid");
  const s = await session();
  if (typeof s === "string") return fail(s);

  let restored = 0;
  await pool(parsed.data, async (it) => {
    let touched = false;
    for (const key of KEYS) {
      const value = it.set[key];
      if (value === undefined || value === null) continue;
      const patch = { [COLUMN[key]]: null } as TablesUpdate<"items">;
      const { data } = await s.supabase.from("items").update(patch).eq("id", it.id).eq("user_id", s.userId).eq(COLUMN[key], value).select("id");
      touched ||= !!data?.length;
    }
    if (it.becameBook) {
      await s.supabase
        .from("items")
        .update({ kind: "item" })
        .eq("id", it.id)
        .eq("user_id", s.userId)
        .eq("kind", "book")
        .is("book_author", null)
        .is("book_year", null)
        .is("book_isbn", null);
    }
    if (it.cover && isOwnPhotoPath(it.cover, s.userId, it.id)) {
      const { data } = await s.supabase.from("item_photos").delete().eq("item_id", it.id).eq("user_id", s.userId).eq("storage_path", it.cover).select("id");
      if (data?.length) {
        touched = true;
        await s.supabase.storage.from(PHOTO_BUCKET).remove(photoFiles(it.cover));
        // Photos added meanwhile: one of them becomes the main one.
        const { data: rest } = await s.supabase.from("item_photos").select("id, is_primary").eq("item_id", it.id).order("created_at");
        if (rest?.length && !rest.some((p) => p.is_primary)) await s.supabase.from("item_photos").update({ is_primary: true }).eq("id", rest[0].id);
      }
    }
    if (touched) restored++;
  });
  revalidatePath("/", "layout");
  return { ok: true, data: { restored } };
}
