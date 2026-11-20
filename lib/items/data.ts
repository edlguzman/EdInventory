import "server-only";
import { PHOTO_BUCKET, thumbPath } from "@/lib/photos/paths";
import { createClient } from "@/lib/supabase/server";
import type { ItemDetail, ItemSummary } from "./types";

type Supabase = Awaited<ReturnType<typeof createClient>>;

const SIGNED_URL_TTL = 60 * 60; // 1 hour

/** A signed URL is reused while it still has this long to live, so photos come from the browser cache. */
const REUSE_MIN_LEFT_MS = 10 * 60 * 1000;
const MAX_CACHED_URLS = 5000;

/**
 * Signed URLs already made by this server instance, by storage path. Every new signature is a new
 * URL, so without this every visit to a list downloaded all thumbnails again. Only paths that a
 * user's own (RLS-filtered) query returned are ever signed or looked up here, and a path contains
 * its owner's id, so a URL is never handed to anyone who could not get it signed anyway.
 */
const urlCache = new Map<string, { url: string; expires: number }>();

/** Signed URLs for many storage paths: cached ones reused, the rest in one request (private bucket). */
async function signUrls(supabase: Supabase, paths: string[]): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  if (paths.length === 0) return result;
  const now = Date.now();
  const missing: string[] = [];
  for (const p of paths) {
    const cached = urlCache.get(p);
    if (cached && cached.expires - now > REUSE_MIN_LEFT_MS) result.set(p, cached.url);
    else missing.push(p);
  }
  if (missing.length === 0) return result;

  const { data } = await supabase.storage.from(PHOTO_BUCKET).createSignedUrls(missing, SIGNED_URL_TTL);
  const expires = now + SIGNED_URL_TTL * 1000;
  for (const entry of data ?? []) {
    if (entry.path && entry.signedUrl) {
      result.set(entry.path, entry.signedUrl);
      urlCache.set(entry.path, { url: entry.signedUrl, expires });
    }
  }
  if (urlCache.size > MAX_CACHED_URLS) {
    for (const [k, v] of urlCache) if (v.expires - now <= REUSE_MIN_LEFT_MS) urlCache.delete(k);
    if (urlCache.size > MAX_CACHED_URLS) urlCache.clear();
  }
  return result;
}

const SUMMARY_COLUMNS =
  "id, name_ru, name_en, category_id, location_id, tags, book_author, book_year, created_at, item_photos(storage_path, is_primary)";

type SummaryRow = {
  id: string;
  name_ru: string;
  name_en: string;
  category_id: string | null;
  location_id: string | null;
  tags: string[];
  book_author: string | null;
  book_year: number | null;
  created_at: string;
  item_photos: { storage_path: string; is_primary: boolean }[];
};

async function toSummaries(supabase: Supabase, rows: SummaryRow[]): Promise<ItemSummary[]> {
  const primaryOf = (r: SummaryRow) => (r.item_photos.find((p) => p.is_primary) ?? r.item_photos[0])?.storage_path;
  const thumbs = rows.map(primaryOf).filter((p): p is string => !!p).map(thumbPath);
  const urls = await signUrls(supabase, thumbs);
  return rows.map((r) => {
    const primary = primaryOf(r);
    return {
      id: r.id,
      nameRu: r.name_ru,
      nameEn: r.name_en,
      categoryId: r.category_id,
      locationId: r.location_id,
      tags: r.tags,
      bookAuthor: r.book_author,
      bookYear: r.book_year,
      createdAt: r.created_at,
      thumbUrl: primary ? (urls.get(thumbPath(primary)) ?? null) : null,
      photoCount: r.item_photos.length,
    };
  });
}

export type ItemFilters = {
  /** Category id, or "none" for items without a category. */
  category?: string;
  /** Place id: the place and everything nested in it. */
  location?: string;
  /** Only items directly in this place (place page). */
  directLocation?: string;
  limit: number;
  /** Skip this many (the next pages of infinite scroll). */
  offset?: number;
};

/** Latest items first. Fetches limit + 1 rows to know whether there are more. */
export async function listItems(filters: ItemFilters): Promise<{ items: ItemSummary[]; hasMore: boolean }> {
  const supabase = await createClient();
  let query = supabase
    .from("items")
    .select(SUMMARY_COLUMNS)
    .order("created_at", { ascending: false })
    .order("id")
    .range(filters.offset ?? 0, (filters.offset ?? 0) + filters.limit);

  if (filters.category === "none") query = query.is("category_id", null);
  else if (filters.category) query = query.eq("category_id", filters.category);

  if (filters.directLocation) {
    query = query.eq("location_id", filters.directLocation);
  } else if (filters.location) {
    const { data: ids, error } = await supabase.rpc("location_descendants", { loc_id: filters.location });
    if (error) throw new Error(`location_descendants failed: ${error.code}`);
    if (!ids || ids.length === 0) return { items: [], hasMore: false };
    query = query.in("location_id", ids);
  }

  const { data, error } = await query;
  if (error) throw new Error(`Failed to load items: ${error.code}`);
  const rows = data as SummaryRow[];
  return { items: await toSummaries(supabase, rows.slice(0, filters.limit)), hasMore: rows.length > filters.limit };
}

/** One item with all photos (primary first), signed URLs for main files and thumbnails. */
export async function getItem(id: string): Promise<ItemDetail | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("items")
    .select(
      "id, name_ru, name_en, description_ru, description_en, category_id, location_id, tags, book_author, book_year, book_isbn, created_at, updated_at, item_photos(id, storage_path, is_primary, created_at)",
    )
    .eq("id", id)
    .maybeSingle();
  if (error || !data) return null;

  const photos = [...data.item_photos].sort(
    (a, b) => Number(b.is_primary) - Number(a.is_primary) || a.created_at.localeCompare(b.created_at),
  );
  const urls = await signUrls(supabase, photos.flatMap((p) => [p.storage_path, thumbPath(p.storage_path)]));

  return {
    id: data.id,
    nameRu: data.name_ru,
    nameEn: data.name_en,
    descriptionRu: data.description_ru,
    descriptionEn: data.description_en,
    categoryId: data.category_id,
    locationId: data.location_id,
    tags: data.tags,
    bookAuthor: data.book_author,
    bookYear: data.book_year,
    bookIsbn: data.book_isbn,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
    photos: photos.map((p) => ({
      id: p.id,
      path: p.storage_path,
      isPrimary: p.is_primary,
      url: urls.get(p.storage_path) ?? null,
      thumbUrl: urls.get(thumbPath(p.storage_path)) ?? null,
    })),
  };
}

export type CategoryOption = { id: string; name_ru: string | null; name_en: string | null };

export async function getCategories(): Promise<CategoryOption[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("categories").select("id, name_ru, name_en").order("sort_order").order("created_at");
  return data ?? [];
}

/** Items by id, in the given order (search results ranked by search_items). */
export async function getItemsByIds(ids: string[]): Promise<ItemSummary[]> {
  if (ids.length === 0) return [];
  const supabase = await createClient();
  const { data, error } = await supabase.from("items").select(SUMMARY_COLUMNS).in("id", ids);
  if (error) throw new Error(`Failed to load items: ${error.code}`);
  const order = new Map(ids.map((id, i) => [id, i]));
  const rows = (data as SummaryRow[]).sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
  return toSummaries(supabase, rows);
}

/** Ranked search over the user's items, authors and ISBNs too (SQL function search_items_v2, RLS applies). */
export async function searchItems(input: {
  terms: string[];
  location: string | null;
  category: string | null;
  limit?: number;
}): Promise<ItemSummary[]> {
  if (input.terms.length === 0) return [];
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("search_items_v2", {
    p_terms: input.terms,
    p_location_id: input.location ?? undefined,
    p_category_id: input.category ?? undefined,
    p_limit: input.limit ?? 50,
  });
  if (error) throw new Error(`search_items_v2 failed: ${error.code}`);
  return getItemsByIds((data ?? []).map((r) => r.id));
}
