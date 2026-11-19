export type LocationNode = {
  id: string;
  parentId: string | null;
  nameRu: string;
  nameEn: string;
  pathRu: string;
  pathEn: string;
  /** Ids from the top-level place down to this one (inclusive). */
  idPath: string[];
  depth: number;
  directItems: number;
  totalItems: number;
};

export type Locale = "ru" | "en";

export const name = (loc: Pick<LocationNode, "nameRu" | "nameEn">, locale: Locale) =>
  locale === "en" ? loc.nameEn : loc.nameRu;

export const path = (loc: Pick<LocationNode, "pathRu" | "pathEn">, locale: Locale) =>
  locale === "en" ? loc.pathEn : loc.pathRu;
