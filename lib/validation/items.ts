import { z } from "zod";
import { MAX_PHOTOS } from "@/lib/photos/paths";
import { BOOK_AUTHOR_MAX, normalizeIsbn, parseYear } from "@/lib/books/isbn";
import { hasRequiredName, langColumn, requiredSlot, resolvePair, type DataLang, type DataMode } from "@/lib/data-lang";
import { LOCATION_NAME_MAX } from "./names";

export const ITEM_NAME_MAX = LOCATION_NAME_MAX; // 200, same as the DB check
export const DESCRIPTION_MAX = 2000;
export const TAG_MAX = 50;
export const TAGS_MAX = 50;
/** At most this many items are found and saved from one photo of several items. */
export const MAX_BATCH_ITEMS = 30;

const name = z.string().trim().max(ITEM_NAME_MAX, { error: "nameTooLong" });
const description = z.string().trim().max(DESCRIPTION_MAX, { error: "descriptionTooLong" });

/**
 * Book fields as the form holds them (strings; "" = none). Optional: a caller that does not
 * send them leaves the stored values alone. Language-neutral (one value, every data mode).
 */
const bookAuthor = z.string().trim().max(BOOK_AUTHOR_MAX, { error: "authorTooLong" });
const bookYear = z
  .string()
  .trim()
  .refine((v) => v === "" || (/^[0-9]{4}$/.test(v) && parseYear(v) !== null), { error: "yearInvalid" });
const bookIsbn = z
  .string()
  .trim()
  .max(20, { error: "isbnInvalid" })
  .refine((v) => v === "" || normalizeIsbn(v) !== null, { error: "isbnInvalid" });

const tagList = z.array(z.string().trim().min(1).max(TAG_MAX, { error: "tagTooLong" })).max(TAGS_MAX, { error: "tooManyTags" });

/**
 * Editable text fields of an item (what the form holds); the required name depends on the
 * mode. `foreign`: the record is in another language than the user's (English is enough).
 * Tags: own-language and English lists, together at most TAGS_MAX.
 */
export const itemFieldsSchema = (mode: DataMode, foreign = false) =>
  z
    .object({
      name_local: name,
      name_en: name,
      description_local: description,
      description_en: description,
      tags_local: tagList,
      tags_en: tagList,
      book_author: bookAuthor.optional(),
      book_year: bookYear.optional(),
      book_isbn: bookIsbn.optional(),
    })
    .refine((v) => hasRequiredName(mode, v.name_local, v.name_en, foreign), {
      error: "nameRequired",
      path: [requiredSlot(mode) === "en" || foreign ? "name_en" : "name_local"],
    })
    .refine((v) => uniqueTags(v.tags_local).length + uniqueTags(v.tags_en).length <= TAGS_MAX, {
      error: "tooManyTags",
      path: ["tags_local"],
    });

export type ItemFieldsInput = z.input<ReturnType<typeof itemFieldsSchema>>;

type BookRow = { book_author: string | null; book_year: number | null; book_isbn: string | null };

/** Stored text of an item with the local slot already passed through ownLocal. */
export type ItemTextRow = {
  name_local: string | null;
  name_en: string | null;
  description_local: string | null;
  description_en: string | null;
  tags_local: string[];
  tags_en: string[];
};

/** Tags without case-insensitive duplicates, order kept. */
export function uniqueTags(tags: string[]) {
  const seen = new Set<string>();
  return tags.filter((t) => {
    const key = t.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Form values -> columns to write, by the user's language and mode (see resolvePair):
 * a slot the user does not see is left as stored, empty descriptions become null, tags are
 * unique; a new record (or one whose own text is rewritten) gets the user's language.
 */
export function toItemRow(v: z.output<ReturnType<typeof itemFieldsSchema>>, d: DataLang, current: ItemTextRow | null) {
  const names = resolvePair(d.mode, { local: v.name_local, en: v.name_en }, current && { local: current.name_local, en: current.name_en });
  const descriptions = resolvePair(
    d.mode,
    { local: v.description_local, en: v.description_en },
    current && { local: current.description_local, en: current.description_en },
  );
  const row: Partial<ItemTextRow & BookRow & { lang: string }> = {};
  // Tags: English only in en mode (the record's own-language tags stay); both otherwise.
  row.tags_en = uniqueTags(v.tags_en);
  if (d.mode !== "en") row.tags_local = uniqueTags(v.tags_local);
  // Book fields: written only when sent (the same in every mode).
  if (v.book_author !== undefined) row.book_author = v.book_author || null;
  if (v.book_year !== undefined) row.book_year = v.book_year ? parseYear(v.book_year) : null;
  if (v.book_isbn !== undefined) row.book_isbn = normalizeIsbn(v.book_isbn);
  if ("local" in names) row.name_local = names.local;
  if ("en" in names) row.name_en = names.en;
  if ("local" in descriptions) row.description_local = descriptions.local;
  if ("en" in descriptions) row.description_en = descriptions.en;
  Object.assign(row, langColumn(d.lang, current === null, { local: names.local }));
  return row;
}

const uuid = z.uuid();

export const itemRefsSchema = z.object({
  category_id: uuid.nullable(),
  location_id: uuid.nullable(),
});

/** Photos sent with create/update: main storage paths only (thumbnails are derived). */
export const newPhotosSchema = z.array(z.string().min(1).max(300)).max(MAX_PHOTOS, { error: "photoTooMany" });
