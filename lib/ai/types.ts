/**
 * Answers of /api/ai/* routes after server-side checks (ids belong to the user, "" -> null).
 * Languages: *_local is the user's language (profiles.lang), *_en English. For a user whose
 * language is English every *_local field is "" / [] (the server clears them).
 */

import type { BookInfo } from "@/lib/books/isbn";
import type { MedSource, MedSubtype, RxStatus } from "@/lib/medicines/attrs";
import type { Expiry } from "@/lib/medicines/expiry";

/** Official US drug data by NDC (openFDA), as the client gets it (no label text). */
export type FdaDrugInfo = {
  ndc: string;
  brandName: string | null;
  genericName: string | null;
  activeIngredients: { name: string; strength: string | null }[];
  dosageForm: string | null;
  rx: RxStatus | null;
  /** The FDA has the label text (uses, warnings) for it. */
  hasLabel: boolean;
};

/** "Scan barcode" in a filled form: the FDA data and the condensed notes (null: unknown NDC). */
export type MedicineSummaryResult = { drug: FdaDrugInfo | null; medicine: MedicineSuggestion | null };

/** A medicine or supplement as recognized ("" = unknown). Only prefills the form. */
export type MedicineSuggestion = {
  subtype: MedSubtype;
  active_local: string;
  active_en: string;
  strength: string;
  form_local: string;
  form_en: string;
  rx: RxStatus | null;
  components: { name_local: string; name_en: string; amount: string }[];
  expires: Expiry | null;
  uses_local: string;
  uses_en: string;
  warnings_local: string;
  warnings_en: string;
  ndc: string | null;
  /** "fda": uses / warnings summarized from the official FDA label; "ai": from the AI. */
  source: MedSource;
};

export type RecognizeResult = {
  name_local: string;
  name_en: string;
  description_local: string;
  description_en: string;
  category_id: string | null;
  tags_local: string[];
  tags_en: string[];
  /** A book: author, year, ISBN as recognized (null = not a book). */
  book: BookInfo | null;
  /** A medicine or supplement (null = neither). */
  medicine: MedicineSuggestion | null;
};

/** A single recognition with the hint that a book was found but the user has no "Books" category. */
export type RecognizeSingleResult = RecognizeResult & { booksCategoryMissing: boolean };

/** Changes to the item mentioned in a voice phrase ("it's dad's old drill, broken"). null = no change. */
export type ItemSuggestion = {
  name_local: string | null;
  name_en: string | null;
  description_local: string | null;
  description_en: string | null;
  tags_add_local: string[];
  tags_add_en: string[];
};

/** A place in a phrase: an existing one, a missing one to create, or several that fit (at most one of the three). */
export type PlaceAnswer = {
  match: string | null;
  /** Missing part of the path: create `names` one inside another, starting under `parent_id` (null = top level). */
  create: { parent_id: string | null; names: { name_local: string; name_en: string }[] } | null;
  ambiguous: string[];
};

export type PlaceResult = PlaceAnswer & { transcript: string; item: ItemSuggestion | null };

/** One item of a phrase ("add by voice"): only what was said. */
export type VoiceItem = RecognizeResult & {
  /** Medicines: for whom, if said. */
  for_whom: string;
  /** Index in VoiceAddResult.places; null = no place named. */
  place: number | null;
};

export type VoiceAddResult = { transcript: string; items: VoiceItem[]; places: PlaceAnswer[] };

export type SearchResult = {
  transcript: string;
  terms: string[];
  category_id: string | null;
  location_id: string | null;
};

export type PlaceMode = "form" | "move";

/** Current form values sent with a "form" phrase, so suggestions can merge with them. */
export type ItemContext = {
  name_local: string;
  name_en: string;
  description_local: string;
  description_en: string;
  tags_local: string[];
  tags_en: string[];
};

/** One item found on a photo of several items; box = [ymin, xmin, ymax, xmax], 0–1000. */
export type DetectedItem = RecognizeResult & { box: [number, number, number, number] };

export type RecognizeMultiResult = { items: DetectedItem[]; booksCategoryMissing: boolean };

/** Dictation into a text field: the text in the field's language ("" = nothing intelligible). */
export type TranscribeResult = { text: string };

/** "Sort into categories": an existing category of the user, or a new one to create. */
export type CategorySuggestion =
  | { categoryId: string; newCategory: null }
  | { categoryId: null; newCategory: { name_local: string; name_en: string } };

export type CategorizedItem = {
  id: string;
  nameLocal: string | null;
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
