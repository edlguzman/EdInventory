"use client";

import Link from "next/link";
import { ImageOff } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useLocations } from "@/components/locations/locations-context";
import { Photo } from "@/components/ui/photo";
import type { CategoryOption } from "@/lib/items/data";
import { pickText, type ItemSummary } from "@/lib/items/types";
import { createLocalStore } from "@/lib/local-store";

export type ItemsView = "gallery" | "table";

/** Gallery or table, remembered on the device. */
export const viewStore = createLocalStore<ItemsView>("inventory.itemsView", "gallery", (raw) =>
  raw === "gallery" || raw === "table" ? raw : undefined,
);

/** "… → Garage → Rack": the end of a long path is the useful part on a small screen. */
function shortPath(full: string) {
  const parts = full.split(" → ");
  return parts.length > 2 ? `… → ${parts.slice(-2).join(" → ")}` : full;
}

function useItemLabels(categories: CategoryOption[], fullPath = false) {
  const locale = useLocale();
  const { byId, path } = useLocations();
  const categoryById = new Map(categories.map((c) => [c.id, c]));
  return {
    name: (i: ItemSummary) => pickText(i.nameRu, i.nameEn, locale),
    place: (i: ItemSummary) => {
      const loc = i.locationId ? byId.get(i.locationId) : undefined;
      return loc ? (fullPath ? path(loc) : shortPath(path(loc))) : null;
    },
    category: (i: ItemSummary) => {
      const c = i.categoryId ? categoryById.get(i.categoryId) : undefined;
      return c ? pickText(c.name_ru, c.name_en, locale) : null;
    },
  };
}

function Thumb({ item, alt, className }: { item: ItemSummary; alt: string; className: string }) {
  const t = useTranslations("items");
  return item.thumbUrl ? (
    <Photo src={item.thumbUrl} alt={alt} loading="lazy" className={`object-cover ${className}`} />
  ) : (
    <span className={`flex items-center justify-center bg-surface text-muted ${className}`} aria-label={t("noPhoto")}>
      <ImageOff className="size-6" aria-hidden />
    </span>
  );
}

export function ItemGallery({ items, categories }: { items: ItemSummary[]; categories: CategoryOption[] }) {
  const labels = useItemLabels(categories);
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {items.map((item) => {
        const name = labels.name(item);
        const place = labels.place(item);
        return (
          <li key={item.id}>
            <Link href={`/items/${item.id}`} className="flex flex-col gap-1.5 rounded-xl active:opacity-80">
              <Thumb item={item} alt={name} className="aspect-square w-full rounded-xl" />
              <span className="line-clamp-2 text-sm font-medium leading-snug">{name}</span>
              {place && <span className="-mt-1 truncate text-xs text-muted">{place}</span>}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export function ItemTable({
  items,
  categories,
  fullPath = false,
}: {
  items: ItemSummary[];
  categories: CategoryOption[];
  /** Show the whole place path (search results), not only its end. */
  fullPath?: boolean;
}) {
  const t = useTranslations("items");
  const labels = useItemLabels(categories, fullPath);
  return (
    <table className="w-full border-collapse text-sm">
      <thead className="hidden sm:table-header-group">
        <tr className="text-left text-muted">
          <th scope="col" className="w-14 pb-2 font-normal">
            <span className="sr-only">{t("photo")}</span>
          </th>
          <th scope="col" className="pb-2 font-normal">{t("colName")}</th>
          <th scope="col" className="pb-2 pl-2 font-normal">{t("colPlace")}</th>
          <th scope="col" className="pb-2 pl-2 font-normal">{t("colCategory")}</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-border">
        {items.map((item) => {
          const name = labels.name(item);
          const place = labels.place(item);
          const category = labels.category(item);
          return (
            <tr key={item.id} className="relative">
              <td className="w-14 min-w-14 py-2 pr-2 align-middle">
                <Thumb item={item} alt="" className="size-12 rounded-lg" />
              </td>
              <td className="w-full max-w-0 py-2 align-middle">
                {/* The whole row is a link target via the stretched ::after. */}
                <Link href={`/items/${item.id}`} className="block truncate font-medium after:absolute after:inset-0">
                  {name}
                </Link>
                <span className={`block text-xs text-muted sm:hidden ${fullPath ? "" : "truncate"}`}>
                  {[place, category].filter(Boolean).join(" · ")}
                </span>
              </td>
              <td className="hidden max-w-56 truncate py-2 pl-2 align-middle text-muted sm:table-cell">{place}</td>
              <td className="hidden max-w-40 truncate py-2 pl-2 align-middle text-muted sm:table-cell">{category}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
