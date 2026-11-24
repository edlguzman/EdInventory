"use client";

import { useDataLang } from "@/components/data-lang/context";
import { useTranslations } from "next-intl";
import { useLocations } from "@/components/locations/locations-context";
import { Photo } from "@/components/ui/photo";
import type { CategoryOption } from "@/lib/items/data";
import { pickText, type ItemSummary } from "@/lib/items/types";
import { createLocalStore } from "@/lib/local-store";
import { ItemIcon } from "./item-icon";
import { SelectableLink, SelectMark, type ItemSelection } from "./selection";
import { ExpiryBadge } from "./medicine";

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
  const { display: locale } = useDataLang();
  const { byId, path } = useLocations();
  const categoryById = new Map(categories.map((c) => [c.id, c]));
  return {
    name: (i: ItemSummary) => pickText(i.nameLocal, i.nameEn, locale),
    /** "Author · 1999" for books, else null. */
    categoryOf: (i: ItemSummary) => (i.categoryId ? categoryById.get(i.categoryId) : undefined),
    book: (i: ItemSummary) => [i.bookAuthor, i.bookYear].filter(Boolean).join(" · ") || null,
    place: (i: ItemSummary) => {
      const loc = i.locationId ? byId.get(i.locationId) : undefined;
      return loc ? (fullPath ? path(loc) : shortPath(path(loc))) : null;
    },
    category: (i: ItemSummary) => {
      const c = i.categoryId ? categoryById.get(i.categoryId) : undefined;
      return c ? pickText(c.name_local, c.name_en, locale) : null;
    },
  };
}

function Thumb({
  item,
  alt,
  className,
  category,
}: {
  item: ItemSummary;
  alt: string;
  className: string;
  category: CategoryOption | undefined;
}) {
  const t = useTranslations("items");
  return item.thumbUrl ? (
    <Photo src={item.thumbUrl} alt={alt} loading="lazy" className={`object-cover ${className}`} />
  ) : (
    <span className={`flex items-center justify-center bg-surface text-muted ${className}`} role="img" aria-label={alt || t("noPhoto")}>
      <ItemIcon kind={item.kind} category={category} className="size-1/3 max-h-16 max-w-16 min-h-6 min-w-6" />
    </span>
  );
}

export function ItemGallery({
  items,
  categories,
  selection,
  expiry = true,
}: {
  items: ItemSummary[];
  categories: CategoryOption[];
  /** Bulk edit: long press / tap to select (Items list). */
  selection?: ItemSelection;
  /** Expiry marks on the cards. */
  expiry?: boolean;
}) {
  const labels = useItemLabels(categories);
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {items.map((item) => {
        const name = labels.name(item);
        const place = labels.place(item);
        return (
          // Off-screen cards are not laid out or painted (long lists stay smooth on phones).
          <li key={item.id} className="[contain-intrinsic-size:auto_220px] [content-visibility:auto]">
            <SelectableLink
              id={item.id}
              href={`/items/${item.id}`}
              selection={selection}
              className="flex flex-col gap-1.5 rounded-xl active:opacity-80"
            >
              <span className="relative block">
                <Thumb
                  category={labels.categoryOf(item)}
                  item={item}
                  alt={name}
                  className={`aspect-square w-full rounded-xl ${selection?.active && selection.selected.has(item.id) ? "ring-3 ring-accent" : ""}`}
                />
                {selection?.active && <SelectMark selected={selection.selected.has(item.id)} className="absolute top-2 right-2" />}
                {expiry && item.expiresOn && (
                  <span className="absolute bottom-1.5 left-1.5">
                    <ExpiryBadge date={item.expiresOn} precision={item.expiryPrecision} />
                  </span>
                )}
              </span>
              <span className="line-clamp-2 text-sm font-medium leading-snug">{name}</span>
              {labels.book(item) && <span className="-mt-1 truncate text-xs">{labels.book(item)}</span>}
              {place && <span className="-mt-1 truncate text-xs text-muted">{place}</span>}
            </SelectableLink>
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
  selection,
  expiry = true,
}: {
  items: ItemSummary[];
  categories: CategoryOption[];
  /** Show the whole place path (search results), not only its end. */
  fullPath?: boolean;
  /** Bulk edit: long press / tap to select. */
  selection?: ItemSelection;
  /** Expiry marks in the rows. */
  expiry?: boolean;
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
              <td className="relative w-14 min-w-14 py-2 pr-2 align-middle">
                <Thumb category={labels.categoryOf(item)} item={item} alt="" className="size-12 rounded-lg" />
                {selection?.active && (
                  <SelectMark selected={selection.selected.has(item.id)} className="absolute top-1/2 left-2.5 -translate-y-1/2" />
                )}
              </td>
              <td className="w-full max-w-0 py-2 align-middle">
                {/* The whole row is a link target via the stretched ::after. */}
                <SelectableLink
                  id={item.id}
                  href={`/items/${item.id}`}
                  selection={selection}
                  className="block truncate font-medium after:absolute after:inset-0"
                >
                  {name}
                </SelectableLink>
                {labels.book(item) && <span className="block truncate text-xs">{labels.book(item)}</span>}
                {expiry && item.expiresOn && (
                  <span className="relative z-10 block">
                    <ExpiryBadge date={item.expiresOn} precision={item.expiryPrecision} />
                  </span>
                )}
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
