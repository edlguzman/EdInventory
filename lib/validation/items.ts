import { z } from "zod";
import { MAX_PHOTOS } from "@/lib/photos/paths";
import { hasRequiredName, isVisibleTag, resolvePair, type DataLang } from "@/lib/data-lang";
import { LOCATION_NAME_MAX } from "./names";

export const ITEM_NAME_MAX = LOCATION_NAME_MAX; // 200, same as the DB check
export const DESCRIPTION_MAX = 2000;
export const TAG_MAX = 50;
export const TAGS_MAX = 50;

const name = z.string().trim().max(ITEM_NAME_MAX, { error: "nameTooLong" });
const description = z.string().trim().max(DESCRIPTION_MAX, { error: "descriptionTooLong" });

/** Editable text fields of an item (what the form holds); the required name depends on the mode. */
export const itemFieldsSchema = (mode: DataLang) =>
  z
    .object({
      name_ru: name,
      name_en: name,
      description_ru: description,
      description_en: description,
      tags: z
        .array(z.string().trim().min(1).max(TAG_MAX, { error: "tagTooLong" }))
        .max(TAGS_MAX, { error: "tooManyTags" }),
    })
    .refine((v) => hasRequiredName(mode, v.name_ru, v.name_en), {
      error: "nameRequired",
      path: [mode === "en" ? "name_en" : "name_ru"],
    });

export type ItemFieldsInput = z.input<ReturnType<typeof itemFieldsSchema>>;

export type ItemTextRow = {
  name_ru: string | null;
  name_en: string | null;
  description_ru: string | null;
  description_en: string | null;
  tags: string[];
};

/**
 * Form values -> columns to write, by the data language mode (see resolvePair):
 * the hidden language is left as stored, empty descriptions become null, tags are
 * unique, and tags hidden in this mode are kept.
 */
export function toItemRow(v: z.output<ReturnType<typeof itemFieldsSchema>>, mode: DataLang, current: ItemTextRow | null) {
  const names = resolvePair(mode, { ru: v.name_ru, en: v.name_en }, current && { ru: current.name_ru, en: current.name_en }, {
    copyToEnglish: true,
  });
  const descriptions = resolvePair(
    mode,
    { ru: v.description_ru, en: v.description_en },
    current && { ru: current.description_ru, en: current.description_en },
    { copyToEnglish: false },
  );
  const hidden = (current?.tags ?? []).filter((t) => !isVisibleTag(t, mode));
  const seen = new Set<string>();
  const tags = [...v.tags, ...hidden].filter((t) => {
    const key = t.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const row: Partial<ItemTextRow> & { tags: string[] } = { tags: tags.slice(0, TAGS_MAX) };
  if ("ru" in names) row.name_ru = names.ru;
  if ("en" in names) row.name_en = names.en;
  if ("ru" in descriptions) row.description_ru = descriptions.ru;
  if ("en" in descriptions) row.description_en = descriptions.en;
  return row;
}

const uuid = z.uuid();

export const itemRefsSchema = z.object({
  category_id: uuid.nullable(),
  location_id: uuid.nullable(),
});

/** Photos sent with create/update: main storage paths only (thumbnails are derived). */
export const newPhotosSchema = z.array(z.string().min(1).max(300)).max(MAX_PHOTOS, { error: "photoTooMany" });
