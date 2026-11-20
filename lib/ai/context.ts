import "server-only";
import { isBooksCategoryName } from "@/lib/books/isbn";
import type { DataLang } from "@/lib/data-lang";
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
    /** The user's "Books" category (by name, any language), where recognized books go. */
    booksId: rows.find((c) => isBooksCategoryName(c.name_ru) || isBooksCategoryName(c.name_en))?.id ?? null,
    prompt: rows.map((c) => `${c.id} | ${c.name_ru ?? c.name_en} | ${c.name_en ?? c.name_ru}`).join("\n") || "(none)",
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

/**
 * Which languages the AI must write in, by the user's data language mode.
 * en: English only (Russian fields stay ""); ru and ru_en: both languages in one request.
 */
export function languageRule(mode: DataLang) {
  return mode === "en"
    ? 'LANGUAGE: the user keeps their inventory in English only. Write every name, description and tag in English; leave every *_ru field "".'
    : "LANGUAGE: write every name and description in both Russian (Cyrillic) and English (Latin letters).";
}
