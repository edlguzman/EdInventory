"use client";

import { isExpiryFilter, type ExpiryFilter } from "@/lib/items/expiry-filter";
import { isKindFilter, showsExpiry, type KindFilter } from "@/lib/items/kind-filter";
import { useDataLang } from "@/components/data-lang/context";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CalendarClock, CheckSquare, ChevronDown, LayoutGrid, List, LoaderCircle, MapPin, X } from "lucide-react";
import { selectAllItemIds } from "@/app/(app)/items/bulk-actions";
import { useErrorText } from "@/lib/use-error-text";
import { BulkBar, UndoToast, useBulkVersion } from "./bulk-bar";
import { BookFillHost } from "./book-fill";
import { SelectionHeader, useItemSelection } from "./selection";
import { useHelpTopic } from "@/components/help/help-sheet";
import { useTranslations } from "next-intl";
import { LocationPicker } from "@/components/locations/location-picker";
import { useCurrentLocation, useLocations, useSetCurrentLocation } from "@/components/locations/locations-context";
import type { CategoryOption } from "@/lib/items/data";
import { pickText, type ItemSummary } from "@/lib/items/types";
import { ItemGallery, ItemTable, viewStore } from "./item-list";
import { useMoreItems } from "./use-more-items";

export type BrowserFilters = { category: string | null; location: string | null; expiry: ExpiryFilter | null; kind: KindFilter | null; limit: number };

const chip =
  "inline-flex min-h-11 max-w-full items-center gap-1.5 rounded-xl border px-3 text-sm font-medium";

const subscribeNever = () => () => {};

type BrowserProps = {
  title: string;
  items: ItemSummary[];
  hasMore: boolean;
  /** All items of these filters (not only the loaded pages). */
  total: number;
  /** Expired / expiring within 30 days in all places and categories (the banner). */
  expiring: { expired: number; soon: number };
  categories: CategoryOption[];
  filters: BrowserFilters;
  pageSize: number;
};

/** The Items list; after a bulk change (or its undo) it starts over with fresh pages. */
export function ItemsBrowser(props: BrowserProps) {
  const version = useBulkVersion();
  return (
    <>
      <BookFillHost card />
      <ItemsBrowserList key={version} {...props} />
      <UndoToast />
    </>
  );
}

function ItemsBrowserList({
  items,
  hasMore,
  total,
  expiring,
  categories,
  filters,
  pageSize,
  title,
}: BrowserProps) {
  const t = useTranslations("items");
  const tBulk = useTranslations("bulk");
  const tMed = useTranslations("medicine");
  const errorText = useErrorText();
  // Bulk edit: "Select" or a long press on a card.
  const selection = useItemSelection();
  // "?" in selection mode: "Many items at once".
  useHelpTopic("bulk", selection.active);
  const [selectingAll, setSelectingAll] = useState(false);
  const [selectError, setSelectError] = useState<string>();
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
    if (merged.expiry) params.set("expiry", merged.expiry);
    if (merged.kind) params.set("kind", merged.kind);
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

  // Next pages while scrolling (appended; remembered for "back").
  const {
    items: listed,
    hasMore: moreToLoad,
    loading: loadingMore,
    loadMore,
    setSentinel,
  } = useMoreItems({
    filterKey: `${filters.category}|${filters.location}|${filters.expiry}|${filters.kind}`,
    category: filters.category,
    location: filters.location,
    expiry: filters.expiry,
    kind: filters.kind,
    initial: items,
    initialHasMore: hasMore,
  });

  const place = filters.location ? byId.get(filters.location) : undefined;
  const hasFilters = Boolean(filters.category || filters.location || filters.expiry || filters.kind);

  /**
   * The banner counts every place: its numbers open "All places" with the expiry filter. "I'm
   * here" is reset by the URL sync below ("all" in the URL), not here: resetting it first would
   * make the sync rewrite the URL without the filter.
   */
  const showExpiring = (expiry: ExpiryFilter) => apply({ category: null, location: null, expiry });

  /** Every item of these filters, not only the loaded pages (the first 500). */
  async function selectAllFound() {
    setSelectingAll(true);
    setSelectError(undefined);
    const r = await selectAllItemIds({ category: filters.category, location: filters.location, expiry: filters.expiry, kind: filters.kind }).catch(() => null);
    setSelectingAll(false);
    if (!r?.ok) return setSelectError(errorText(r?.error ?? "network"));
    selection.selectAll(r.data.ids, r.data.total);
  }

  return (
    <div className="flex flex-col gap-4">
      {selection.active && (
        <SelectionHeader selection={selection} onSelectAll={() => void selectAllFound()} selectingAll={selectingAll} />
      )}
      {selectError && <p className="text-sm text-red-600 dark:text-red-400">{selectError}</p>}
      <div className="-mb-1 flex items-center justify-between gap-2">
        <h1 className="min-w-0 truncate text-2xl font-semibold tracking-tight">{title}</h1>
        {!selection.active && items.length > 0 && !openingHere && (
          <button
            type="button"
            onClick={() => selection.start()}
            className="ml-auto inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl px-2 text-sm font-medium text-accent"
          >
            <CheckSquare className="size-4" aria-hidden />
            {tBulk("select")}
          </button>
        )}
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
                {pickText(c.name_local, c.name_en, locale)}
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

        <label className={`${chip} relative ${filters.kind ? "border-accent text-accent" : "border-border"}`}>
          <span className="sr-only">{t("filterKind")}</span>
          <select
            value={filters.kind ?? ""}
            onChange={(e) => {
              const kind = isKindFilter(e.target.value) ? e.target.value : null;
              // A type without expiry dates also drops the expiry filter.
              apply(showsExpiry(kind) ? { kind } : { kind, expiry: null });
            }}
            className="max-w-40 appearance-none truncate bg-transparent pr-5 outline-none"
          >
            <option value="">{t("kindAll")}</option>
            <option value="book">{t("kindBook")}</option>
            <option value="medicine">{t("kindMedicine")}</option>
          </select>
          <ChevronDown className="pointer-events-none absolute right-2.5 size-4" aria-hidden />
        </label>

        {(filters.expiry || expiring.expired + expiring.soon > 0) && (
          <label className={`${chip} relative ${filters.expiry ? "border-accent text-accent" : "border-border"}`}>
            <span className="sr-only">{tMed("filterExpiry")}</span>
            <CalendarClock className="size-4 shrink-0" aria-hidden />
            <select
              value={filters.expiry ?? ""}
              onChange={(e) => apply({ expiry: isExpiryFilter(e.target.value) ? e.target.value : null })}
              className="max-w-44 appearance-none truncate bg-transparent pr-5 outline-none"
            >
              <option value="">{tMed("filterExpiryAll")}</option>
              <option value="soon">{tMed("filterExpirySoon")}</option>
              <option value="expired">{tMed("filterExpired")}</option>
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 size-4" aria-hidden />
          </label>
        )}

        {hasFilters && (
          <button type="button" onClick={() => {
              setHere(null);
              apply({ category: null, location: null, expiry: null, kind: null });
            }} className={`${chip} border-transparent text-muted`}>
            <X className="size-4" aria-hidden />
            {t("resetFilters")}
          </button>
        )}

      </div>
      {!openingHere && filters.kind === "medicine" && !filters.expiry && expiring.expired + expiring.soon > 0 && (
        <p className="flex flex-wrap items-center gap-x-1.5 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">
          <CalendarClock className="size-4 shrink-0" aria-hidden />
          <span>{tMed("bannerTitle")}</span>
          {expiring.expired > 0 && (
            <button type="button" onClick={() => showExpiring("expired")} className="min-h-9 font-semibold underline underline-offset-2">
              {tMed("bannerExpired", { count: expiring.expired })}
            </button>
          )}
          {expiring.expired > 0 && expiring.soon > 0 && <span aria-hidden>·</span>}
          {expiring.soon > 0 && (
            <button type="button" onClick={() => showExpiring("soon")} className="min-h-9 font-semibold underline underline-offset-2">
              {tMed("bannerSoon", { count: expiring.soon })}
            </button>
          )}
        </p>
      )}
      {!openingHere && (
        <p className="-mt-2 text-xs text-muted" aria-live="polite">
          {[
            hasFilters ? t("countFound", { count: total }) : t("countAll", { count: total }),
            place && place.id === hereId && t("isHere"),
            place && t("nestedIncluded"),
          ]
            .filter(Boolean)
            .join(" · ")}
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
        <ItemTable items={listed} categories={categories} selection={selection} expiry={showsExpiry(filters.kind)} />
      ) : (
        <ItemGallery items={listed} categories={categories} selection={selection} expiry={showsExpiry(filters.kind)} />
      )}

      {moreToLoad && !openingHere && (
        <div ref={setSentinel} className="flex min-h-11 items-center justify-center">
          {loadingMore ? (
            <LoaderCircle className="size-6 animate-spin text-muted" aria-label={t("loadingMore")} />
          ) : (
            // Fallback when the automatic load did not run (or failed): load by tap.
            <button
              type="button"
              onClick={() => void loadMore()}
              className="flex min-h-11 w-full items-center justify-center rounded-xl border border-border font-medium"
            >
              {t("showMore")}
            </button>
          )}
        </div>
      )}

      {selection.active && <BulkBar ids={[...selection.selected]} loaded={listed} categories={categories} onDone={selection.exit} />}

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
