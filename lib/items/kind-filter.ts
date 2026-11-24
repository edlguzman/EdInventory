import { isBooksCategoryName } from "@/lib/books/isbn";
import { isMedicinesCategoryName, isSupplementsCategoryName } from "@/lib/medicines/attrs";

/** Type filter of the Items list. */
export type KindFilter = "book" | "medicine";

export const isKindFilter = (v: unknown): v is KindFilter => v === "book" || v === "medicine";

/** Expiry dates (line, filter, marks) belong to medicines: shown for "Medicines" and "All types" only. */
export const showsExpiry = (kind: KindFilter | null) => kind === null || kind === "medicine";

type CategoryNames = { id: string; name_local: string | null; name_en: string | null };

/**
 * Categories that mean this type (by name, in any of the app's languages): an item in one of
 * them counts even without book / medicine data of its own.
 */
export function kindCategoryIds(categories: CategoryNames[], kind: KindFilter): string[] {
  const match =
    kind === "book"
      ? isBooksCategoryName
      : (n: string | null) => isMedicinesCategoryName(n) || isSupplementsCategoryName(n);
  return categories.filter((c) => match(c.name_local) || match(c.name_en)).map((c) => c.id);
}

/** PostgREST "or" condition: items of this type, or in one of its categories. */
export function kindCondition(kind: KindFilter, categoryIds: string[]) {
  return [`kind.eq.${kind}`, ...(categoryIds.length ? [`category_id.in.(${categoryIds.join(",")})`] : [])].join(",");
}
