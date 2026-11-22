/** Items per page of the Items list (first page on the server, next pages while scrolling). */
export const ITEMS_PAGE_SIZE = 48;

export type ItemSummary = {
  id: string;
  /** Text in the user's language (null: none, or the item is in another language). */
  nameLocal: string | null;
  nameEn: string | null;
  categoryId: string | null;
  locationId: string | null;
  /** Own-language tags (only when the item is in the user's language) and English tags. */
  tagsLocal: string[];
  tagsEn: string[];
  /** Book fields (null when not a book / not known). */
  bookAuthor: string | null;
  bookYear: number | null;
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
  /** In another language than the user's: shown and edited through English until translated. */
  foreign: boolean;
  descriptionLocal: string | null;
  descriptionEn: string | null;
  bookIsbn: string | null;
  updatedAt: string;
  photos: ItemPhoto[];
};

/** Text in the shown slot; if it is empty there, the other one (lib/data-lang). */
export { pickText } from "@/lib/data-lang";
