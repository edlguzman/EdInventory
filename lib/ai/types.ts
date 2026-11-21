/** Answers of /api/ai/* routes after server-side checks (ids belong to the user, "" -> null). */

import type { BookInfo } from "@/lib/books/isbn";

export type RecognizeResult = {
  name_ru: string;
  name_en: string;
  description_ru: string;
  description_en: string;
  category_id: string | null;
  tags: string[];
  /** A book: author, year, ISBN as recognized (null = not a book). */
  book: BookInfo | null;
};

/** A single recognition with the hint that a book was found but the user has no "Books" category. */
export type RecognizeSingleResult = RecognizeResult & { booksCategoryMissing: boolean };

/** Changes to the item mentioned in a voice phrase ("it's dad's old drill, broken"). null = no change. */
export type ItemSuggestion = {
  name_ru: string | null;
  name_en: string | null;
  description_ru: string | null;
  description_en: string | null;
  tags_add: string[];
};

export type PlaceResult = {
  transcript: string;
  match: string | null;
  /** Missing part of the path: create `names` one inside another, starting under `parent_id` (null = top level). */
  create: { parent_id: string | null; names: { name_ru: string; name_en: string }[] } | null;
  ambiguous: string[];
  item: ItemSuggestion | null;
};

export type SearchResult = {
  transcript: string;
  terms: string[];
  category_id: string | null;
  location_id: string | null;
};

export type PlaceMode = "form" | "move";

/** Current form values sent with a "form" phrase, so suggestions can merge with them. */
export type ItemContext = {
  name_ru: string;
  name_en: string;
  description_ru: string;
  description_en: string;
  tags: string[];
};

/** One item found on a photo of several items; box = [ymin, xmin, ymax, xmax], 0–1000. */
export type DetectedItem = RecognizeResult & { box: [number, number, number, number] };

export type RecognizeMultiResult = { items: DetectedItem[]; booksCategoryMissing: boolean };

/** Dictation into a text field: the text in the field's language ("" = nothing intelligible). */
export type TranscribeResult = { text: string };

/** "Sort into categories": an existing category of the user, or a new one to create. */
export type CategorySuggestion =
  | { categoryId: string; newCategory: null }
  | { categoryId: null; newCategory: { name_ru: string; name_en: string } };

export type CategorizedItem = {
  id: string;
  nameRu: string | null;
  nameEn: string | null;
  currentCategoryId: string | null;
  /** null: the model gave no usable answer for this item (left as it is). */
  suggestion: CategorySuggestion | null;
  /** 0–1. */
  confidence: number;
};

export type CategorizeResult = { items: CategorizedItem[] };

/** ISBNs read from a photo of a back cover / copyright page (valid checksums only, ISBN-13 first). */
export type IsbnReadResult = { isbns: string[] };
