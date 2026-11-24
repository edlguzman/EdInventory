"use client";

import { createElement } from "react";
import {
  Armchair,
  Backpack,
  BookOpen,
  Dumbbell,
  FileText,
  Leaf,
  Package,
  Pill,
  Plug,
  Shirt,
  SprayCan,
  Utensils,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { isBooksCategoryName } from "@/lib/books/isbn";
import type { ItemKind } from "@/lib/items/types";
import { isMedicinesCategoryName, isSupplementsCategoryName } from "@/lib/medicines/attrs";

/** Default categories (as created at sign-up, in every language) -> icon. Other names: a plain box. */
const BY_NAME: [LucideIcon, string[]][] = [
  [Armchair, ["мебель", "furniture", "muebles"]],
  [Wrench, ["инструменты", "tools", "herramientas"]],
  [Utensils, ["кухня", "kitchen", "cocina"]],
  [Plug, ["электроника", "electronics", "electrónica"]],
  [Shirt, ["одежда", "clothing", "clothes", "ropa"]],
  [FileText, ["документы", "documents", "documentos"]],
  [SprayCan, ["хозтовары", "household", "artículos del hogar"]],
  [Dumbbell, ["спорт и отдых", "sports & leisure", "deporte y ocio"]],
  [Backpack, ["личные вещи", "personal items", "objetos personales"]],
];

type CategoryName = { name_local: string | null; name_en: string | null };

function iconFor(kind: ItemKind, category: CategoryName | null | undefined): LucideIcon {
  const names = [category?.name_local, category?.name_en].map((n) => n?.trim().toLowerCase()).filter((n): n is string => !!n);
  if (names.some(isSupplementsCategoryName)) return Leaf;
  if (kind === "medicine" || names.some(isMedicinesCategoryName)) return Pill;
  if (kind === "book" || names.some(isBooksCategoryName)) return BookOpen;
  return BY_NAME.find(([, list]) => names.some((n) => list.includes(n)))?.[0] ?? Package;
}

/** Placeholder picture of an item without photos: the icon of its type or category. */
export function ItemIcon({ kind, category, className }: { kind: ItemKind; category: CategoryName | null | undefined; className?: string }) {
  return createElement(iconFor(kind, category), { className, "aria-hidden": true });
}
