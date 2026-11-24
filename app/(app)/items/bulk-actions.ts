"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getUser } from "@/lib/auth";
import { dailyLimit } from "@/lib/ai/route";
import { getMyPlan } from "@/lib/plans";
import { photoFiles, PHOTO_BUCKET } from "@/lib/photos/paths";
import { createClient } from "@/lib/supabase/server";
import { kindOr } from "@/lib/items/data";
import { withExpiry } from "@/lib/items/expiry-filter";

/**
 * Bulk edit of selected items (v1.9.0). Every action: signed-in active account, zod, at most
 * BULK_MAX items, and every query is limited to the caller's own rows twice — RLS plus
 * user_id in the query. Ids that are not the caller's (or no longer exist) are simply not
 * changed; the answer says how many were.
 */

/** At most this many items per action (and per "select all found"). */
const BULK_MAX = 500;
/** Ids per database request: keeps the request URL short (PostgREST filters go in the URL). */
const CHUNK = 100;

export type BulkError = "unauthorized" | "accountInactive" | "invalid" | "notFound" | "unknown";
export type BulkResult<T> = { ok: true; data: T } | { ok: false; error: BulkError };

/** Value of one field of one item before a change, for "Undo". */
export type PreviousValue = { id: string; value: string | null };
export type ChangeResult = { changed: number; field: "category_id" | "location_id"; previous: PreviousValue[] };

const idsSchema = z
  .array(z.uuid())
  .min(1)
  .max(BULK_MAX)
  .transform((ids) => [...new Set(ids)]);

type Supabase = Awaited<ReturnType<typeof createClient>>;
type Session = { supabase: Supabase; userId: string };

/** Signed-in and active (pending or disabled accounts are refused here, and by RLS anyway). */
async function session(): Promise<Session | BulkError> {
  const user = await getUser();
  if (!user) return "unauthorized";
  const supabase = await createClient();
  const { data: active } = await supabase.rpc("is_active");
  if (!active) return "accountInactive";
  return { supabase, userId: user.id };
}

const chunks = <T,>(list: T[], size = CHUNK) => Array.from({ length: Math.ceil(list.length / size) }, (_, i) => list.slice(i * size, (i + 1) * size));
const fail = (error: BulkError): { ok: false; error: BulkError } => ({ ok: false, error });

/** Lists, item cards, place counts: refresh the whole (app) layout. */
function refresh() {
  revalidatePath("/", "layout");
}

/** Current values of `field` for the caller's own items among `ids` (missing ids are not theirs). */
async function currentValues(s: Session, ids: string[], field: "category_id" | "location_id"): Promise<PreviousValue[] | null> {
  const out: PreviousValue[] = [];
  for (const part of chunks(ids)) {
    const { data, error } = await s.supabase.from("items").select(`id, ${field}`).in("id", part).eq("user_id", s.userId);
    if (error) return null;
    for (const row of data as unknown as Record<string, string | null>[]) out.push({ id: row.id as string, value: row[field] });
  }
  return out;
}

/** Sets `field` per item; items with the same new value are updated together. */
async function writeValues(s: Session, field: "category_id" | "location_id", values: PreviousValue[]): Promise<number | BulkError> {
  const groups = new Map<string | null, string[]>();
  for (const v of values) groups.set(v.value, [...(groups.get(v.value) ?? []), v.id]);
  let changed = 0;
  for (const [value, ids] of groups) {
    for (const part of chunks(ids)) {
      const { data, error } = await s.supabase
        .from("items")
        .update(field === "category_id" ? { category_id: value } : { location_id: value })
        .in("id", part)
        .eq("user_id", s.userId)
        .select("id");
      // A foreign key error: the category or place is not the caller's (composite keys).
      if (error) return error.code === "23503" ? "notFound" : "unknown";
      changed += data?.length ?? 0;
    }
  }
  return changed;
}

/** One value for all: remember the old ones (Undo), then write. */
async function setForAll(field: "category_id" | "location_id", rawIds: string[], rawValue: string | null): Promise<BulkResult<ChangeResult>> {
  const ids = idsSchema.safeParse(rawIds);
  const value = z.uuid().nullable().safeParse(rawValue);
  if (!ids.success || !value.success) return fail("invalid");
  const s = await session();
  if (typeof s === "string") return fail(s);

  const previous = await currentValues(s, ids.data, field);
  if (!previous) return fail("unknown");
  const toChange = previous.filter((p) => p.value !== value.data);
  const changed = await writeValues(s, field, toChange.map((p) => ({ id: p.id, value: value.data })));
  if (typeof changed === "string") return fail(changed);
  refresh();
  return { ok: true, data: { changed, field, previous: toChange } };
}

/** "Category" for the selected items (null = no category). */
export async function bulkSetCategory(input: { ids: string[]; categoryId: string | null }) {
  return setForAll("category_id", input.ids, input.categoryId);
}

/** "Move" the selected items (null = no place). Does not change "I'm here". */
export async function bulkMove(input: { ids: string[]; locationId: string | null }) {
  return setForAll("location_id", input.ids, input.locationId);
}

const changesSchema = z
  .array(z.object({ id: z.uuid(), categoryId: z.uuid().nullable() }))
  .min(1)
  .max(BULK_MAX);

/** "Sort into categories" after review: each item gets its own category. */
export async function bulkApplyCategories(input: { changes: { id: string; categoryId: string | null }[] }): Promise<BulkResult<ChangeResult>> {
  const parsed = changesSchema.safeParse(input.changes);
  if (!parsed.success) return fail("invalid");
  const wanted = new Map(parsed.data.map((c) => [c.id, c.categoryId]));
  const s = await session();
  if (typeof s === "string") return fail(s);

  const previous = await currentValues(s, [...wanted.keys()], "category_id");
  if (!previous) return fail("unknown");
  const toChange = previous.filter((p) => p.value !== wanted.get(p.id));
  const changed = await writeValues(s, "category_id", toChange.map((p) => ({ id: p.id, value: wanted.get(p.id) ?? null })));
  if (typeof changed === "string") return fail(changed);
  refresh();
  return { ok: true, data: { changed, field: "category_id", previous: toChange } };
}

const restoreSchema = z.object({
  field: z.enum(["category_id", "location_id"]),
  values: z.array(z.object({ id: z.uuid(), value: z.uuid().nullable() })).min(1).max(BULK_MAX),
});

/**
 * "Undo": every item gets back its own previous value. A category or place deleted meanwhile
 * cannot be restored (foreign key): those items are left as they are.
 */
export async function bulkRestore(input: z.input<typeof restoreSchema>): Promise<BulkResult<{ restored: number }>> {
  const parsed = restoreSchema.safeParse(input);
  if (!parsed.success) return fail("invalid");
  const s = await session();
  if (typeof s === "string") return fail(s);
  const restored = await writeValues(s, parsed.data.field, parsed.data.values);
  if (typeof restored === "string") return fail(restored);
  refresh();
  return { ok: true, data: { restored } };
}

/** "Delete N items and their photos": rows first (photo rows cascade), then both files of every photo. */
export async function bulkDelete(input: { ids: string[] }): Promise<BulkResult<{ deleted: number }>> {
  const ids = idsSchema.safeParse(input.ids);
  if (!ids.success) return fail("invalid");
  const s = await session();
  if (typeof s === "string") return fail(s);

  let deleted = 0;
  const paths: string[] = [];
  for (const part of chunks(ids.data)) {
    const { data: photos } = await s.supabase.from("item_photos").select("storage_path").in("item_id", part).eq("user_id", s.userId);
    const { data, error } = await s.supabase.from("items").delete().in("id", part).eq("user_id", s.userId).select("id");
    if (error) return fail("unknown");
    deleted += data?.length ?? 0;
    // Only files of items that were really deleted (photo rows of others were not readable anyway).
    paths.push(...(photos ?? []).map((p) => p.storage_path));
  }
  // Best effort, like a single delete: a leftover file is invisible, a broken item is not.
  for (const part of chunks(paths.flatMap(photoFiles), 1000)) {
    const { error } = await s.supabase.storage.from(PHOTO_BUCKET).remove(part);
    if (error) console.error("bulk delete: photo files not removed", { count: part.length });
  }
  refresh();
  return { ok: true, data: { deleted } };
}

const filtersSchema = z.object({
  category: z.union([z.literal("none"), z.uuid()]).nullable(),
  location: z.uuid().nullable(),
  expiry: z.enum(["soon", "expired"]).nullable().optional(),
  kind: z.enum(["book", "medicine"]).nullable().optional(),
});

/**
 * "Select all found" in the Items list: ids of every item matching the filters (not only the
 * loaded pages), newest first like the list; at most BULK_MAX, with the total.
 */
export async function selectAllItemIds(input: z.input<typeof filtersSchema>): Promise<BulkResult<{ ids: string[]; total: number }>> {
  const f = filtersSchema.safeParse(input);
  if (!f.success) return fail("invalid");
  const s = await session();
  if (typeof s === "string") return fail(s);

  let query = s.supabase
    .from("items")
    .select("id", { count: "exact" })
    .eq("user_id", s.userId)
    .order("created_at", { ascending: false })
    .order("id")
    .limit(BULK_MAX);
  if (f.data.category === "none") query = query.is("category_id", null);
  else if (f.data.category) query = query.eq("category_id", f.data.category);
  query = withExpiry(query, f.data.expiry);
  if (f.data.kind) query = query.or(await kindOr(s.supabase, f.data.kind));
  if (f.data.location) {
    const { data: places, error } = await s.supabase.rpc("location_descendants", { loc_id: f.data.location });
    if (error) return fail("unknown");
    if (!places?.length) return { ok: true, data: { ids: [], total: 0 } };
    query = query.in("location_id", places);
  }
  const { data, count, error } = await query;
  if (error) return fail("unknown");
  return { ok: true, data: { ids: (data ?? []).map((r) => r.id), total: count ?? data?.length ?? 0 } };
}

/** AI requests left in the rolling 24 hours (null = no limit: admins), for "this takes N requests". */
export async function aiRequestsLeft(): Promise<number | null> {
  const plan = await getMyPlan();
  if (!plan) return 0;
  if (plan.isAdmin) return null;
  if (plan.atItemLimit) return 0;
  return Math.max(0, (plan.aiDailyLimit ?? dailyLimit()) - plan.aiUsed24h);
}
