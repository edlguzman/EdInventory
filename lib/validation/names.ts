import { z } from "zod";
import { hasRequiredName, resolvePair, type DataLang } from "@/lib/data-lang";

/**
 * A pair of names (RU + EN). Which one is required depends on the data language mode
 * (en: English, ru: Russian, ru_en: at least one). Limits match the database checks:
 * 200 for places/items, 100 for categories. What is actually written (copying, hidden
 * language left untouched) is decided on the server by resolvePair().
 */
export function namePairSchema(max: number, mode: DataLang) {
  const field = z.string().trim().max(max, { error: "nameTooLong" });
  return z
    .object({ name_ru: field, name_en: field })
    .refine((v) => hasRequiredName(mode, v.name_ru, v.name_en), {
      error: "nameRequired",
      path: [mode === "en" ? "name_en" : "name_ru"],
    });
}

export const LOCATION_NAME_MAX = 200;
export const CATEGORY_NAME_MAX = 100;

export const locationNamesSchema = (mode: DataLang) => namePairSchema(LOCATION_NAME_MAX, mode);
export const categoryNamesSchema = (mode: DataLang) => namePairSchema(CATEGORY_NAME_MAX, mode);

export type NamePairInput = { name_ru: string; name_en: string };

/** Names of a place or category -> columns to write (the hidden language is left as stored). */
export function toNameRow(
  mode: DataLang,
  v: NamePairInput,
  current: { name_ru: string | null; name_en: string | null } | null,
): { name_ru?: string | null; name_en?: string | null } {
  const r = resolvePair(mode, { ru: v.name_ru, en: v.name_en }, current && { ru: current.name_ru, en: current.name_en }, {
    copyToEnglish: true,
  });
  return { ...("ru" in r ? { name_ru: r.ru } : {}), ...("en" in r ? { name_en: r.en } : {}) };
}
