import "server-only";
import { getDataLang } from "@/lib/auth";
import { isForeign, ownLocal } from "@/lib/data-lang";
import type { Lang } from "@/lib/languages";
import { PHOTO_BUCKET, thumbPath } from "@/lib/photos/paths";
import { createClient } from "@/lib/supabase/server";
import { maskMedicineAttrs, readMedicineAttrs } from "@/lib/medicines/attrs";
import { withExpiry, type ExpiryFilter } from "./expiry-filter";
import type { ItemDetail, ItemKind, ItemSummary } from "./types";

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
  "id, lang, name_local, name_en, category_id, location_id, tags_local, tags_en, book_author, book_year, kind, expires_on, expiry_precision:attrs->>expiry_precision, created_at, item_photos(storage_path, is_primary)";

type SummaryRow = {
  id: string;
  lang: string | null;
  name_local: string | null;
  name_en: string | null;
  category_id: string | null;
  location_id: string | null;
  tags_local: string[];
  tags_en: string[];
  book_author: string | null;
  book_year: number | null;
  kind: string;
  expires_on: string | null;
  expiry_precision: string | null;
  created_at: string;
  item_photos: { storage_path: string; is_primary: boolean }[];
};

const kindOf = (k: string | null | undefined): ItemKind => (k === "book" || k === "medicine" ? k : "item");

async function toSummaries(supabase: Supabase, rows: SummaryRow[]): Promise<ItemSummary[]> {
  const { lang } = await getDataLang();
  const primaryOf = (r: SummaryRow) => (r.item_photos.find((p) => p.is_primary) ?? r.item_photos[0])?.storage_path;
  const thumbs = rows.map(primaryOf).filter((p): p is string => !!p).map(thumbPath);
  const urls = await signUrls(supabase, thumbs);
  return rows.map((r) => {
    const primary = primaryOf(r);
    return {
      id: r.id,
      nameLocal: ownLocal(r.lang, lang, r.name_local),
      nameEn: r.name_en,
      categoryId: r.category_id,
      locationId: r.location_id,
      tagsLocal: ownLocal(r.lang, lang, r.tags_local) ?? [],
      tagsEn: r.tags_en,
      bookAuthor: r.book_author,
      bookYear: r.book_year,
      kind: kindOf(r.kind),
      expiresOn: r.expires_on,
      expiryPrecision: r.expiry_precision === "month" ? "month" : "day",
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
  /** Expiry: expires within 30 days / already expired. */
  expiry?: ExpiryFilter;
  limit: number;
  /** Skip this many (the next pages of infinite scroll). */
  offset?: number;
};

/**
 * Latest items first. Fetches limit + 1 rows to know whether there are more.
 * total: all items of these filters (counted in the same request), only for the first page.
 */
export async function listItems(
  filters: ItemFilters,
): Promise<{ items: ItemSummary[]; hasMore: boolean; total: number | null }> {
  const supabase = await createClient();
  const first = !filters.offset;
  let query = supabase
    .from("items")
    .select(SUMMARY_COLUMNS, first ? { count: "exact" } : undefined)
    .order("created_at", { ascending: false })
    .order("id")
    .range(filters.offset ?? 0, (filters.offset ?? 0) + filters.limit);

  if (filters.category === "none") query = query.is("category_id", null);
  else if (filters.category) query = query.eq("category_id", filters.category);
  query = withExpiry(query, filters.expiry);

  if (filters.directLocation) {
    query = query.eq("location_id", filters.directLocation);
  } else if (filters.location) {
    const { data: ids, error } = await supabase.rpc("location_descendants", { loc_id: filters.location });
    if (error) throw new Error(`location_descendants failed: ${error.code}`);
    if (!ids || ids.length === 0) return { items: [], hasMore: false, total: first ? 0 : null };
    query = query.in("location_id", ids);
  }

  const { data, count, error } = await query;
  if (error) throw new Error(`Failed to load items: ${error.code}`);
  const rows = data as SummaryRow[];
  return {
    items: await toSummaries(supabase, rows.slice(0, filters.limit)),
    hasMore: rows.length > filters.limit,
    total: first ? (count ?? rows.length) : null,
  };
}

/** One item with all photos (primary first), signed URLs for main files and thumbnails. */
export async function getItem(id: string): Promise<ItemDetail | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("items")
    .select(
      "id, lang, name_local, name_en, description_local, description_en, category_id, location_id, tags_local, tags_en, book_author, book_year, book_isbn, kind, attrs, expires_on, created_at, updated_at, item_photos(id, storage_path, is_primary, created_at)",
    )
    .eq("id", id)
    .maybeSingle();
  if (error || !data) return null;

  const photos = [...data.item_photos].sort(
    (a, b) => Number(b.is_primary) - Number(a.is_primary) || a.created_at.localeCompare(b.created_at),
  );
  const urls = await signUrls(supabase, photos.flatMap((p) => [p.storage_path, thumbPath(p.storage_path)]));
  const { lang } = await getDataLang();
  const foreign = isForeign(data.lang, lang);
  const medicine = data.kind === "medicine" ? maskMedicineAttrs(readMedicineAttrs(data.attrs), foreign) : null;

  return {
    id: data.id,
    foreign,
    nameLocal: ownLocal(data.lang, lang, data.name_local),
    nameEn: data.name_en,
    descriptionLocal: ownLocal(data.lang, lang, data.description_local),
    descriptionEn: data.description_en,
    categoryId: data.category_id,
    locationId: data.location_id,
    tagsLocal: ownLocal(data.lang, lang, data.tags_local) ?? [],
    tagsEn: data.tags_en,
    bookAuthor: data.book_author,
    bookYear: data.book_year,
    bookIsbn: data.book_isbn,
    kind: kindOf(data.kind),
    medicine,
    expiresOn: data.expires_on,
    expiryPrecision: medicine?.expiry_precision ?? "day",
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

/** A category with its own-language name already passed through ownLocal. */
export type CategoryOption = { id: string; name_local: string | null; name_en: string | null };

/** Categories with name_local only when they are in the user's language. */
export function toCategoryOptions(
  rows: { id: string; lang: string | null; name_local: string | null; name_en: string | null }[],
  lang: Lang,
): CategoryOption[] {
  return rows.map((c) => ({ id: c.id, name_local: ownLocal(c.lang, lang, c.name_local), name_en: c.name_en }));
}

export async function getCategories(): Promise<CategoryOption[]> {
  const supabase = await createClient();
  const [{ data }, { lang }] = await Promise.all([
    supabase.from("categories").select("id, lang, name_local, name_en").order("sort_order").order("created_at"),
    getDataLang(),
  ]);
  return toCategoryOptions(data ?? [], lang);
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

export const SEARCH_PAGE_SIZE = 50;

/**
 * Ranked search over the user's items in their language and English, authors and ISBNs too
 * (search_items_v5, RLS: also active ingredients, supplement components, NDC). One page from `offset`, plus the total found (null past the end).
 */
export async function searchItems(input: {
  terms: string[];
  location: string | null;
  category: string | null;
  limit?: number;
  offset?: number;
}): Promise<{ items: ItemSummary[]; total: number | null }> {
  const ids = await searchItemIds(input);
  return { items: await getItemsByIds(ids.ids), total: ids.total };
}

/** Only the ids (in rank order) and the total: for "Select all found". */
export async function searchItemIds(input: {
  terms: string[];
  location: string | null;
  category: string | null;
  limit?: number;
  offset?: number;
}): Promise<{ ids: string[]; total: number | null }> {
  if (input.terms.length === 0) return { ids: [], total: 0 };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("search_items_v5", {
    p_terms: input.terms,
    p_location_id: input.location ?? undefined,
    p_category_id: input.category ?? undefined,
    p_limit: input.limit ?? SEARCH_PAGE_SIZE,
    p_offset: input.offset ?? 0,
  });
  if (error) throw new Error(`search_items_v5 failed: ${error.code}`);
  const rows = data ?? [];
  return { ids: rows.map((r) => r.id), total: rows[0]?.total ?? (input.offset ? null : 0) };
}

/**
 * Items with an expiry date that has passed / comes within 30 days (the "Expiry: N expired,
 * M within 30 days" line counts all places and categories; filters optional).
 */
export async function expiryCounts(filters: { category?: string; location?: string }): Promise<{ expired: number; soon: number }> {
  const supabase = await createClient();
  let places: string[] | null = null;
  if (filters.location) {
    const { data } = await supabase.rpc("location_descendants", { loc_id: filters.location });
    places = data ?? [];
    if (places.length === 0) return { expired: 0, soon: 0 };
  }
  const count = async (f: ExpiryFilter) => {
    let q = supabase.from("items").select("id", { count: "exact", head: true }).not("expires_on", "is", null);
    if (filters.category === "none") q = q.is("category_id", null);
    else if (filters.category) q = q.eq("category_id", filters.category);
    if (places) q = q.in("location_id", places);
    const { count: n } = await withExpiry(q, f);
    return n ?? 0;
  };
  const [expired, soon] = await Promise.all([count("expired"), count("soon")]);
  return { expired, soon };
}
