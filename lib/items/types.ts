export type ItemSummary = {
  id: string;
  nameRu: string;
  nameEn: string;
  categoryId: string | null;
  locationId: string | null;
  tags: string[];
  createdAt: string;
  thumbUrl: string | null;
  photoCount: number;
};

export type ItemPhoto = {
  id: string;
  /** Main storage path; the thumbnail path is derived from it. */
  path: string;
  isPrimary: boolean;
  url: string | null;
  thumbUrl: string | null;
};

export type ItemDetail = Omit<ItemSummary, "thumbUrl" | "photoCount"> & {
  descriptionRu: string | null;
  descriptionEn: string | null;
  updatedAt: string;
  photos: ItemPhoto[];
};

/** Text in the interface language; if it is empty there, the other language (CLAUDE.md). */
export function pickText(ru: string | null | undefined, en: string | null | undefined, locale: string) {
  const [first, second] = locale === "en" ? [en, ru] : [ru, en];
  return first?.trim() ? first : (second ?? "");
}
