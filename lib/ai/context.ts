import "server-only";
import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

/**
 * The user's own categories and places, read from the database (RLS) — never taken
 * from the client. Gemini gets them as short lines; any id it returns is checked
 * against these lists before use.
 */
export async function aiCategories(supabase: Supabase) {
  const { data } = await supabase.from("categories").select("id, name_ru, name_en").order("sort_order");
  const rows = data ?? [];
  return {
    ids: new Set(rows.map((c) => c.id)),
    prompt: rows.map((c) => `${c.id} | ${c.name_ru} | ${c.name_en}`).join("\n") || "(none)",
  };
}

export async function aiLocations(supabase: Supabase) {
  const { data } = await supabase.from("location_paths").select("id, path_ru, path_en").order("path_ru");
  const rows = (data ?? []).filter((l): l is { id: string; path_ru: string; path_en: string } => !!(l.id && l.path_ru && l.path_en));
  return {
    ids: new Set(rows.map((l) => l.id)),
    pathById: new Map(rows.map((l) => [l.id, l])),
    prompt: rows.map((l) => `${l.id} | ${l.path_ru} | ${l.path_en}`).join("\n") || "(no places yet)",
  };
}

/** "" or an id that is not the user's -> null. */
export function ownId(value: string | undefined, ids: Set<string>): string | null {
  const v = value?.trim() ?? "";
  return v && ids.has(v) ? v : null;
}
