import { z } from "zod";

/**
 * A pair of names (RU + EN). At least one is required; if only one is filled,
 * it is copied into the other (CLAUDE.md: both columns are required in the database).
 * Limits match the database checks: 200 for places/items, 100 for categories.
 */
export function namePairSchema(max: number) {
  const field = z.string().trim().max(max, { error: "nameTooLong" });
  return z
    .object({ name_ru: field, name_en: field })
    .refine((v) => v.name_ru.length > 0 || v.name_en.length > 0, { error: "nameRequired", path: ["name_ru"] })
    .transform((v) => ({
      name_ru: v.name_ru || v.name_en,
      name_en: v.name_en || v.name_ru,
    }));
}

export const LOCATION_NAME_MAX = 200;
export const CATEGORY_NAME_MAX = 100;

export const locationNamesSchema = namePairSchema(LOCATION_NAME_MAX);
export const categoryNamesSchema = namePairSchema(CATEGORY_NAME_MAX);

export type NamePairInput = { name_ru: string; name_en: string };
