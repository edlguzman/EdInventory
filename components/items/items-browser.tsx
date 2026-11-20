"use client";

import { useDataLang } from "@/components/data-lang/context";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronDown, LayoutGrid, List, LoaderCircle, MapPin, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { LocationPicker } from "@/components/locations/location-picker";
import { useCurrentLocation, useLocations, useSetCurrentLocation } from "@/components/locations/locations-context";
import type { CategoryOption } from "@/lib/items/data";
import { pickText, type ItemSummary } from "@/lib/items/types";
import { ItemGallery, ItemTable, viewStore } from "./item-list";

export type BrowserFilters = { category: string | null; location: string | null; limit: number };

const chip =
  "inline-flex min-h-11 max-w-full items-center gap-1.5 rounded-xl border px-3 text-sm font-medium";

const subscribeNever = () => () => {};

export function ItemsBrowser({
  items,
  hasMore,
  categories,
  filters,
  pageSize,
  title,
}: {
  title: string;
  items: ItemSummary[];
  hasMore: boolean;
  categories: CategoryOption[];
  filters: BrowserFilters;
  pageSize: number;
}) {
  const t = useTranslations("items");
  const { display: locale } = useDataLang();
  const router = useRouter();
  const pathname = usePathname();
  const view = viewStore.useValue();
  const { byId, path } = useLocations();
  const [picking, setPicking] = useState(false);

  const href = (next: Partial<BrowserFilters>) => {
    const merged = { ...filters, ...next };
    const params = new URLSearchParams();
    if (merged.category) params.set("category", merged.category);
    // Always explicit: a place id or "all". Only a bare URL follows "I'm here".
    params.set("location", merged.location ?? "all");
    if (merged.limit > pageSize) params.set("n", String(merged.limit));
    const qs = params.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  };
  // A new filter starts from the first page again.
  const apply = (next: Partial<BrowserFilters>) => router.push(href({ ...next, limit: pageSize }), { scroll: false });

  // The place filter IS "I'm here" (one place everywhere):
  // - a place given in the URL (filter choice, "all items in this place" link) becomes "I'm here",
  //   "all" resets it;
  // - otherwise, and whenever "I'm here" changes elsewhere (header), the list follows it.
  // Only after hydration: "I'm here" lives in localStorage, the server render does not know it.
  const searchParams = useSearchParams();
  const locationInUrl = searchParams.has("location");
  const here = useCurrentLocation();
  const hereId = here?.id ?? null;
  const setHere = useSetCurrentLocation();
  const hydrated = useSyncExternalStore(subscribeNever, () => true, () => false);
  const adopted = useRef(false);
  useEffect(() => {
    if (!hydrated) return;
    if (!adopted.current) {
      adopted.current = true;
      if (locationInUrl && filters.location !== hereId) return setHere(filters.location);
    }
    if (filters.location !== hereId) router.replace(href({ location: hereId }), { scroll: false });
    // href and filters are read at the moment "I'm here" changes; nothing else should re-run this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, hereId]);

  // Until the list matches "I'm here", it is not shown (no flash of another place).
  const openingHere = !hydrated ? !locationInUrl : filters.location !== hereId;

  const place = filters.location ? byId.get(filters.location) : undefined;
  const hasFilters = Boolean(filters.category || filters.location);

  return (
    <div className="flex flex-col gap-4">
      <div className="-mb-1 flex items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <div role="group" aria-label={`${t("viewGallery")} / ${t("viewTable")}`} className="flex shrink-0 rounded-xl border border-border p-0.5">
          {(
            [
              ["gallery", LayoutGrid, t("viewGallery")],
              ["table", List, t("viewTable")],
            ] as const
          ).map(([value, Icon, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => viewStore.set(value)}
              aria-pressed={view === value}
              aria-label={label}
              className={`flex size-10 items-center justify-center rounded-lg ${view === value ? "bg-surface text-foreground" : "text-muted"}`}
            >
              <Icon className="size-5" aria-hidden />
            </button>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label className={`${chip} relative ${filters.category ? "border-accent text-accent" : "border-border"}`}>
          <span className="sr-only">{t("filterCategory")}</span>
          <select
            value={filters.category ?? ""}
            onChange={(e) => apply({ category: e.target.value || null })}
            className="max-w-40 appearance-none truncate bg-transparent pr-5 outline-none"
          >
            <option value="">{t("allCategories")}</option>
            <option value="none">{t("noCategory")}</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {pickText(c.name_ru, c.name_en, locale)}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-2.5 size-4" aria-hidden />
        </label>

        <button
          type="button"
          onClick={() => setPicking(true)}
          className={`${chip} ${place ? "border-accent text-accent" : "border-border"}`}
        >
          <MapPin className="size-4 shrink-0" aria-hidden />
          <span className="truncate">{place ? path(place) : t("allPlaces")}</span>
        </button>

        {hasFilters && (
          <button type="button" onClick={() => {
              setHere(null);
              apply({ category: null, location: null });
            }} className={`${chip} border-transparent text-muted`}>
            <X className="size-4" aria-hidden />
            {t("resetFilters")}
          </button>
        )}

      </div>
      {place && (
        <p className="-mt-2 text-xs text-muted">
          {place.id === hereId ? `${t("isHere")} · ${t("nestedIncluded")}` : t("nestedIncluded")}
        </p>
      )}

      {openingHere ? (
        <p role="status" className="flex justify-center p-6 text-muted">
          <LoaderCircle className="size-6 animate-spin" aria-hidden />
        </p>
      ) : items.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border p-6 text-center text-muted">
          {hasFilters ? t("emptyFiltered") : t("empty")}
        </p>
      ) : view === "table" ? (
        <ItemTable items={items} categories={categories} />
      ) : (
        <ItemGallery items={items} categories={categories} />
      )}

      {hasMore && !openingHere && (
        <Link
          href={href({ limit: filters.limit + pageSize })}
          scroll={false}
          className="flex min-h-11 items-center justify-center rounded-xl border border-border font-medium"
        >
          {t("showMore")}
        </Link>
      )}

      <LocationPicker
        open={picking}
        onClose={() => setPicking(false)}
        title={t("filterLocation")}
        initialId={filters.location}
        allowRoot
        rootLabel={t("allPlaces")}
        onSelect={(id) => {
          setPicking(false);
          // The filter is "I'm here": a place sets it, "All places" resets it.
          setHere(id);
          apply({ location: id });
        }}
      />
    </div>
  );
}
