import { z } from "zod";
import { hasRequiredName, langColumn, requiredSlot, resolvePair, type DataLang, type DataMode } from "@/lib/data-lang";

/**
 * A name in the user's language plus English. Which one is required depends on the mode
 * (en: English, local: own language, local_en: at least one; a record in another language:
 * either). Limits match the database checks: 200 for places/items, 100 for categories.
 * What is actually written (slot left untouched, language of the record) is decided on the
 * server by toNameRow().
 */
export function namePairSchema(max: number, mode: DataMode, foreign = false) {
  const field = z.string().trim().max(max, { error: "nameTooLong" });
  return z
    .object({ name_local: field, name_en: field })
    .refine((v) => hasRequiredName(mode, v.name_local, v.name_en, foreign), {
      error: "nameRequired",
      path: [requiredSlot(mode) === "en" || foreign ? "name_en" : "name_local"],
    });
}

export const LOCATION_NAME_MAX = 200;
export const CATEGORY_NAME_MAX = 100;

export const locationNamesSchema = (mode: DataMode, foreign = false) => namePairSchema(LOCATION_NAME_MAX, mode, foreign);
export const categoryNamesSchema = (mode: DataMode, foreign = false) => namePairSchema(CATEGORY_NAME_MAX, mode, foreign);

export type NamePairInput = { name_local: string; name_en: string };

/**
 * Names of a place or category -> columns to write. `current`: the stored row with the local
 * name already passed through ownLocal (null for a new record).
 */
export function toNameRow(
  d: DataLang,
  v: NamePairInput,
  current: { name_local: string | null; name_en: string | null } | null,
): { name_local?: string | null; name_en?: string | null; lang?: string } {
  const r = resolvePair(d.mode, { local: v.name_local, en: v.name_en }, current && { local: current.name_local, en: current.name_en });
  return {
    ...("local" in r ? { name_local: r.local } : {}),
    ...("en" in r ? { name_en: r.en } : {}),
    ...langColumn(d.lang, current === null, { local: r.local }),
  };
}
