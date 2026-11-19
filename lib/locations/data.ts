import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { LocationNode } from "./types";

/** All places of the current user with full paths and item counts (RLS limits rows to the user). */
export async function getLocations(): Promise<LocationNode[]> {
  const supabase = await createClient();
  const [locs, paths, counts] = await Promise.all([
    supabase.from("locations").select("id, parent_id, name_ru, name_en"),
    supabase.from("location_paths").select("id, path_ru, path_en, id_path, depth"),
    supabase.from("location_item_counts").select("location_id, direct_items, total_items"),
  ]);
  if (locs.error || paths.error || counts.error) {
    const error = locs.error ?? paths.error ?? counts.error;
    throw new Error(`Failed to load locations: ${error?.code}`);
  }

  const pathById = new Map(paths.data.map((p) => [p.id, p]));
  const countById = new Map(counts.data.map((c) => [c.location_id, c]));

  return locs.data.map((l) => {
    const p = pathById.get(l.id);
    const c = countById.get(l.id);
    return {
      id: l.id,
      parentId: l.parent_id,
      nameRu: l.name_ru,
      nameEn: l.name_en,
      pathRu: p?.path_ru ?? l.name_ru,
      pathEn: p?.path_en ?? l.name_en,
      idPath: p?.id_path ?? [l.id],
      depth: p?.depth ?? 0,
      directItems: c?.direct_items ?? 0,
      totalItems: c?.total_items ?? 0,
    };
  });
}
