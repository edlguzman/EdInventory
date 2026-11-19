export type LocationNode = {
  id: string;
  parentId: string | null;
  nameRu: string | null;
  nameEn: string | null;
  pathRu: string;
  pathEn: string;
  /** Ids from the top-level place down to this one (inclusive). */
  idPath: string[];
  depth: number;
  directItems: number;
  totalItems: number;
};

export type Locale = "ru" | "en";

/** Name in the display language, or the other one if it is missing. */
export const name = (loc: Pick<LocationNode, "nameRu" | "nameEn">, locale: Locale) =>
  (locale === "en" ? (loc.nameEn ?? loc.nameRu) : (loc.nameRu ?? loc.nameEn)) ?? "";

export const path = (loc: Pick<LocationNode, "pathRu" | "pathEn">, locale: Locale) =>
  locale === "en" ? loc.pathEn : loc.pathRu;
