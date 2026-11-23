import "server-only";
import { isMedicinesCategoryName, isSupplementsCategoryName } from "@/lib/medicines/attrs";
import { isBooksCategoryName } from "@/lib/books/isbn";
import { ownLocal, type DataLang } from "@/lib/data-lang";
import { englishName, type Lang } from "@/lib/languages";
import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** "Spanish", "Russian (Cyrillic letters)": the user's language as named in prompts. */
export function languageLabel(lang: Lang) {
  return lang === "ru" ? "Russian (Cyrillic letters)" : englishName(lang);
}

/** Column header of prompt lists: "id | Spanish | English" (English users: "id | English"). */
function header(lang: Lang, what: "" | " path") {
  return lang === "en" ? `id | English${what}` : `id | ${englishName(lang)}${what} | English${what}`;
}

/**
 * The user's own categories and places, read from the database (RLS) — never taken
 * from the client. Gemini gets them as short lines; any id it returns is checked
 * against these lists before use.
 * Category names: the own-language name only when the record is in the user's language
 * (ownLocal), otherwise English stands in for it.
 */
export async function aiCategories(supabase: Supabase, lang: Lang) {
  const { data } = await supabase.from("categories").select("id, lang, name_local, name_en").order("sort_order");
  const rows = (data ?? []).map((c) => ({
    id: c.id,
    local: ownLocal(c.lang, lang, c.name_local),
    en: c.name_en,
    /** Own text in whatever language it is (Books matching only). */
    raw: c.name_local,
  }));
  return {
    ids: new Set(rows.map((c) => c.id)),
    /** Masked names (local in the user's language or null, English), for matching by name. */
    names: rows.map((c) => ({ id: c.id, local: c.local, en: c.en })),
    /** The user's "Books" category (by name, any language), where recognized books go. */
    booksId: rows.find((c) => isBooksCategoryName(c.raw) || isBooksCategoryName(c.en))?.id ?? null,
    /** The user's "Medicines" / "Vitamins & supplements" categories (by name, any language). */
    medicinesId: rows.find((c) => isMedicinesCategoryName(c.raw) || isMedicinesCategoryName(c.en))?.id ?? null,
    supplementsId: rows.find((c) => isSupplementsCategoryName(c.raw) || isSupplementsCategoryName(c.en))?.id ?? null,
    header: `Categories (${header(lang, "")}):`,
    prompt:
      rows
        .map((c) => (lang === "en" ? `${c.id} | ${c.en ?? c.raw}` : `${c.id} | ${c.local ?? c.en} | ${c.en ?? c.local ?? c.raw}`))
        .join("\n") || "(none)",
  };
}

/** Places with their full paths (location_paths_v2: path_local in the user's language, English fallback). */
export async function aiLocations(supabase: Supabase, lang: Lang) {
  const { data } = await supabase.from("location_paths_v2").select("id, path_local, path_en").order("path_en");
  const rows = (data ?? [])
    .filter((l): l is { id: string; path_local: string | null; path_en: string | null } => !!(l.id && (l.path_local || l.path_en)))
    .map((l) => ({ id: l.id, path_local: l.path_local ?? l.path_en ?? "", path_en: l.path_en ?? l.path_local ?? "" }));
  const line = (l: { id: string; path_local: string; path_en: string }) =>
    lang === "en" ? `${l.id} | ${l.path_en}` : `${l.id} | ${l.path_local} | ${l.path_en}`;
  return {
    ids: new Set(rows.map((l) => l.id)),
    pathById: new Map(rows.map((l) => [l.id, l])),
    line,
    /** "id | Spanish path | English path" */
    columns: header(lang, " path"),
    header: `Places (${header(lang, " path")}):`,
    prompt: rows.map(line).join("\n") || "(no places yet)",
  };
}

/** "" or an id that is not the user's -> null. */
export function ownId(value: string | undefined, ids: Set<string>): string | null {
  const v = value?.trim() ?? "";
  return v && ids.has(v) ? v : null;
}

/**
 * Which languages the AI must write in. English users: English only, every *_local field ""
 * (the server clears them anyway). Others: *_local in their language, *_en in English.
 */
export function languageRule({ lang }: DataLang) {
  if (lang === "en") {
    return 'LANGUAGE: the user keeps their inventory in English. Write every name, description and tag in English; leave every *_local field "" (lists: []).';
  }
  const name = languageLabel(lang);
  return [
    `LANGUAGE: the user's language is ${englishName(lang)}. Every *_local field (names, descriptions, tags_local) is in ${name},`,
    `written naturally, as a native speaker of ${englishName(lang)} would write it (not a word-for-word translation);`,
    "every *_en field (names, descriptions, tags_en) is in English (Latin letters). Fill both.",
  ].join("\n");
}

/** Which languages the user may speak or type (voice phrases, questions). */
export function speechRule(lang: Lang) {
  return lang === "en"
    ? "The user usually speaks or types English, but may use another language."
    : `The user may speak or type ${englishName(lang)} or English (or mix them).`;
}

/** Server-side guard: English users never get *_local text, whatever the model returned. */
export function localText(lang: Lang) {
  return (v: string, max = Infinity) => (lang === "en" ? "" : v.trim().slice(0, max));
}

/** Same for *_local tag lists. */
export function localTags(lang: Lang, tags: string[], clean: (t: string[]) => string[]) {
  return lang === "en" ? [] : clean(tags);
}
