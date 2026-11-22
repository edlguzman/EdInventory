import type { Slot } from "@/lib/data-lang";

export type LocationNode = {
  id: string;
  parentId: string | null;
  /** Name in the user's language (null: none, or the place is in another language). */
  nameLocal: string | null;
  nameEn: string | null;
  /** Full path in the user's language where the places have it, else English. */
  pathLocal: string;
  pathEn: string;
  /** Ids from the top-level place down to this one (inclusive). */
  idPath: string[];
  depth: number;
  directItems: number;
  totalItems: number;
};

/** Name in the shown slot, or the other one if it is missing. */
export const name = (loc: Pick<LocationNode, "nameLocal" | "nameEn">, slot: Slot) =>
  (slot === "en" ? (loc.nameEn ?? loc.nameLocal) : (loc.nameLocal ?? loc.nameEn)) ?? "";

export const path = (loc: Pick<LocationNode, "pathLocal" | "pathEn">, slot: Slot) => (slot === "en" ? loc.pathEn : loc.pathLocal);
