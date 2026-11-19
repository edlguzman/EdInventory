/** Answers of /api/ai/* routes after server-side checks (ids belong to the user, "" -> null). */

export type RecognizeResult = {
  name_ru: string;
  name_en: string;
  description_ru: string;
  description_en: string;
  category_id: string | null;
  tags: string[];
};

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

export type RecognizeMultiResult = { items: DetectedItem[] };
