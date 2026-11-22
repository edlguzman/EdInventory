"use client";

import Link from "next/link";
import { Copy, ImageOff } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import type { ExistingItem } from "@/app/(app)/items/duplicate-actions";
import { useDataLang } from "@/components/data-lang/context";
import { useLocations } from "@/components/locations/locations-context";
import { Photo } from "@/components/ui/photo";

const SHOWN = 3;

export function useExistingName() {
  const { display } = useDataLang();
  return (it: Pick<ExistingItem, "name_local" | "name_en">) =>
    (display === "en" ? it.name_en || it.name_local : it.name_local || it.name_en) ?? "";
}

/** "Date · place" of an existing item. */
function useWhereWhen() {
  const format = useFormatter();
  const t = useTranslations("duplicates");
  const { byId, path } = useLocations();
  return (it: ExistingItem) => {
    const place = it.location_id ? byId.get(it.location_id) : undefined;
    return `${format.dateTime(new Date(it.created_at), { day: "numeric", month: "short" })} · ${place ? path(place) : t("noPlace")}`;
  };
}

/**
 * "This photo has already been added": the items made from the same file, with links.
 * Shown before any AI request; `actions` are the buttons (continue anyway / cancel).
 */
export function PhotoUsedNotice({ items, actions }: { items: ExistingItem[]; actions: React.ReactNode }) {
  const t = useTranslations("duplicates");
  const name = useExistingName();
  const whereWhen = useWhereWhen();
  const places = new Set(items.map((it) => it.location_id));
  const commonPlace = places.size === 1 ? items[0].location_id : null;

  return (
    <div role="alert" className="flex flex-col gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-950 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100">
      <p className="flex items-start gap-2 font-medium">
        <Copy className="mt-0.5 size-5 shrink-0" aria-hidden />
        {t("photoUsed", { count: items.length })}
      </p>
      <ul className="flex flex-col gap-2">
        {items.slice(0, SHOWN).map((it) => (
          <li key={it.id}>
            <Link href={`/items/${it.id}`} className="flex min-h-11 items-center gap-3 rounded-lg bg-background/70 p-1.5 pr-3">
              <span className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-md bg-surface text-muted">
                {it.thumbUrl ? <Photo src={it.thumbUrl} alt="" className="size-full object-cover" /> : <ImageOff className="size-4" aria-hidden />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-foreground">{name(it)}</span>
                <span className="block truncate text-xs text-muted">{whereWhen(it)}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {items.length > SHOWN && (
        <p className="text-sm">
          {t("andMore", { count: items.length - SHOWN })}
          {commonPlace && (
            <>
              {" "}
              <Link href={`/locations/${commonPlace}`} className="font-medium underline">
                {t("openPlace")}
              </Link>
            </>
          )}
        </p>
      )}
      <div className="flex flex-wrap gap-2">{actions}</div>
    </div>
  );
}

/** One line on a found item's card: an item with a similar name already exists. */
export function SimilarNote({ item }: { item: ExistingItem }) {
  const t = useTranslations("duplicates");
  const name = useExistingName();
  const whereWhen = useWhereWhen();
  return (
    <div className="flex items-center gap-2 rounded-lg bg-amber-50 p-1.5 text-amber-950 dark:bg-amber-950 dark:text-amber-100">
      <span className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded bg-surface text-muted">
        {item.thumbUrl ? <Photo src={item.thumbUrl} alt="" className="size-full object-cover" /> : <ImageOff className="size-4" aria-hidden />}
      </span>
      <span className="min-w-0 flex-1 text-xs leading-snug">
        <span className="block truncate font-medium">{t("similar", { name: name(item) })}</span>
        <span className="block truncate opacity-80">{whereWhen(item)}</span>
      </span>
    </div>
  );
}
