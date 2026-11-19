import "server-only";
import { PHOTO_BUCKET, thumbPath } from "@/lib/photos/paths";
import { createClient } from "@/lib/supabase/server";
import type { ItemDetail, ItemSummary } from "./types";

type Supabase = Awaited<ReturnType<typeof createClient>>;

const SIGNED_URL_TTL = 60 * 60; // 1 hour

/** Signed URLs for many storage paths in one request (private bucket). */
async function signUrls(supabase: Supabase, paths: string[]): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  if (paths.length === 0) return result;
  const { data } = await supabase.storage.from(PHOTO_BUCKET).createSignedUrls(paths, SIGNED_URL_TTL);
  for (const entry of data ?? []) {
    if (entry.path && entry.signedUrl) result.set(entry.path, entry.signedUrl);
  }
  return result;
}

const SUMMARY_COLUMNS =
  "id, name_ru, name_en, category_id, location_id, tags, created_at, item_photos(storage_path, is_primary)";

type SummaryRow = {
  id: string;
  name_ru: string;
  name_en: string;
  category_id: string | null;
  location_id: string | null;
  tags: string[];
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
};

/** Latest items first. Fetches limit + 1 rows to know whether there are more. */
export async function listItems(filters: ItemFilters): Promise<{ items: ItemSummary[]; hasMore: boolean }> {
  const supabase = await createClient();
  let query = supabase
    .from("items")
    .select(SUMMARY_COLUMNS)
    .order("created_at", { ascending: false })
    .order("id")
    .limit(filters.limit + 1);

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
      "id, name_ru, name_en, description_ru, description_en, category_id, location_id, tags, created_at, updated_at, item_photos(id, storage_path, is_primary, created_at)",
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

/** Ranked search over the user's items (SQL function search_items, RLS applies). */
export async function searchItems(input: {
  terms: string[];
  location: string | null;
  category: string | null;
  limit?: number;
}): Promise<ItemSummary[]> {
  if (input.terms.length === 0) return [];
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("search_items", {
    p_terms: input.terms,
    p_location_id: input.location ?? undefined,
    p_category_id: input.category ?? undefined,
    p_limit: input.limit ?? 50,
  });
  if (error) throw new Error(`search_items failed: ${error.code}`);
  return getItemsByIds((data ?? []).map((r) => r.id));
}
