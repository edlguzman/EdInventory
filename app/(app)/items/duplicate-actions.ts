"use server";

import { z } from "zod";
import { getItemsByIds } from "@/lib/items/data";
import { createClient } from "@/lib/supabase/server";
import { MAX_BATCH_ITEMS } from "@/lib/validation/items";
import { photoHashSchema } from "@/lib/validation/photo-hash";

/** An existing item shown in a duplicate warning. */
export type ExistingItem = {
  id: string;
  name_local: string | null;
  name_en: string | null;
  location_id: string | null;
  created_at: string;
  thumbUrl: string | null;
};

/** Trigram similarity of names from which an item counts as "probably the same" (calibrated on real data). */
const SIMILAR_MIN = 0.5;

/**
 * Same photo again: the user's items that already have a photo made from a file with one of
 * these SHA-256 hashes. No AI involved. RLS: only the user's own photos are searched.
 * Result: hash -> items (newest first).
 */
export async function findPhotoUses(hashes: string[]): Promise<Record<string, ExistingItem[]>> {
  const parsed = z.array(photoHashSchema).max(10).safeParse(hashes);
  if (!parsed.success || parsed.data.length === 0) return {};
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("item_photos")
    .select("source_hash, item_id")
    .in("source_hash", parsed.data)
    .limit(200);
  if (error || !data?.length) return {};

  const ids = [...new Set(data.map((r) => r.item_id))];
  const items = new Map((await getItemsByIds(ids)).map((it) => [it.id, it]));
  const result: Record<string, ExistingItem[]> = {};
  for (const row of data) {
    const it = items.get(row.item_id);
    if (!it || !row.source_hash) continue;
    const list = (result[row.source_hash] ??= []);
    if (list.some((x) => x.id === it.id)) continue;
    list.push({
      id: it.id,
      name_local: it.nameLocal,
      name_en: it.nameEn,
      location_id: it.locationId,
      created_at: it.createdAt,
      thumbUrl: it.thumbUrl,
    });
  }
  for (const list of Object.values(result)) list.sort((a, b) => b.created_at.localeCompare(a.created_at));
  return result;
}

const namesSchema = z
  .array(z.object({ local: z.string().max(200), en: z.string().max(200) }))
  .max(MAX_BATCH_ITEMS);

/**
 * Similar items already in the inventory, for the items found on a photo: for each input
 * (by position) the best match by name similarity, items in `locationId` and its nested
 * places first (SQL similar_items_v2: own-language and English names, RLS applies). No AI involved.
 */
export async function findSimilarItems(input: {
  names: { local: string; en: string }[];
  locationId: string | null;
}): Promise<Record<number, ExistingItem & { inPlace: boolean }>> {
  const names = namesSchema.safeParse(input.names);
  const location = z.uuid().nullable().safeParse(input.locationId);
  if (!names.success || !location.success || names.data.length === 0) return {};

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("similar_items_v2", {
    p_names_local: names.data.map((n) => n.local),
    p_names_en: names.data.map((n) => n.en),
    p_location_id: location.data ?? undefined,
    p_min: SIMILAR_MIN,
  });
  if (error || !data?.length) return {};

  const items = new Map((await getItemsByIds([...new Set(data.map((r) => r.item_id))])).map((it) => [it.id, it]));
  const result: Record<number, ExistingItem & { inPlace: boolean }> = {};
  for (const row of data) {
    const it = items.get(row.item_id);
    if (!it) continue;
    result[row.idx - 1] = {
      id: it.id,
      name_local: it.nameLocal,
      name_en: it.nameEn,
      location_id: it.locationId,
      created_at: it.createdAt,
      thumbUrl: it.thumbUrl,
      inPlace: row.in_place,
    };
  }
  return result;
}
