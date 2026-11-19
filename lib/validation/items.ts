import { z } from "zod";
import { MAX_PHOTOS } from "@/lib/photos/paths";
import { LOCATION_NAME_MAX } from "./names";

export const ITEM_NAME_MAX = LOCATION_NAME_MAX; // 200, same as the DB check
export const DESCRIPTION_MAX = 2000;
export const TAG_MAX = 50;
export const TAGS_MAX = 50;

const name = z.string().trim().max(ITEM_NAME_MAX, { error: "nameTooLong" });
const description = z.string().trim().max(DESCRIPTION_MAX, { error: "descriptionTooLong" });

/** Editable text fields of an item (what the form holds). */
export const itemFieldsSchema = z
  .object({
    name_ru: name,
    name_en: name,
    description_ru: description,
    description_en: description,
    tags: z
      .array(z.string().trim().min(1).max(TAG_MAX, { error: "tagTooLong" }))
      .max(TAGS_MAX, { error: "tooManyTags" }),
  })
  .refine((v) => v.name_ru.length > 0 || v.name_en.length > 0, { error: "nameRequired", path: ["name_ru"] });

export type ItemFieldsInput = z.input<typeof itemFieldsSchema>;

/** Normalizes form values for the database: one name copied into the other, empty descriptions -> null, unique tags. */
export function toItemRow(v: z.output<typeof itemFieldsSchema>) {
  const seen = new Set<string>();
  const tags = v.tags.filter((t) => {
    const key = t.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return {
    name_ru: v.name_ru || v.name_en,
    name_en: v.name_en || v.name_ru,
    description_ru: v.description_ru || null,
    description_en: v.description_en || null,
    tags,
  };
}

const uuid = z.uuid();

export const itemRefsSchema = z.object({
  category_id: uuid.nullable(),
  location_id: uuid.nullable(),
});

/** Photos sent with create/update: main storage paths only (thumbnails are derived). */
export const newPhotosSchema = z.array(z.string().min(1).max(300)).max(MAX_PHOTOS, { error: "photoTooMany" });
