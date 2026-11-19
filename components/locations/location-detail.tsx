"use client";

import Link from "next/link";
import { Check, ChevronRight, MapPin, MoreHorizontal, Package, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/buttons";
import { useLocationActions } from "./location-dialogs";
import { setCurrentLocationId, useCurrentLocation, useLocations } from "./locations-context";

export function LocationDetail({ id }: { id: string }) {
  const t = useTranslations("locations");
  const tHere = useTranslations("here");
  const tCommon = useTranslations("common");
  const { byId, childrenOf, name } = useLocations();
  const { openMenu, openCreate } = useLocationActions();
  const current = useCurrentLocation();
  const loc = byId.get(id);

  // Deleted while open: the delete dialog navigates away; show a short fallback meanwhile.
  if (!loc) {
    return (
      <div className="flex flex-col items-start gap-3">
        <p className="text-muted">{t("notFound")}</p>
        <Link href="/locations" className="py-2 font-medium text-accent">
          {t("backToList")}
        </Link>
      </div>
    );
  }

  const ancestors = loc.idPath.slice(0, -1).map((a) => byId.get(a)).filter((a) => a !== undefined);
  const nested = childrenOf(id);
  const isHere = current?.id === id;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <nav aria-label={t("allPlaces")} className="mb-1 flex flex-wrap items-center gap-x-1 text-sm">
          <Link href="/locations" className="inline-flex min-h-9 items-center text-accent">
            {t("title")}
          </Link>
          {ancestors.map((a) => (
            <span key={a.id} className="inline-flex items-center gap-1">
              <ChevronRight className="size-4 text-muted" aria-hidden />
              <Link href={`/locations/${a.id}`} className="inline-flex min-h-9 items-center text-accent">
                {name(a)}
              </Link>
            </span>
          ))}
        </nav>
        <div className="flex items-start gap-2">
          <h1 className="min-w-0 flex-1 text-2xl font-semibold tracking-tight break-words">{name(loc)}</h1>
          <button
            type="button"
            onClick={() => openMenu(id)}
            aria-label={`${tCommon("moreActions")}: ${name(loc)}`}
            className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-border"
          >
            <MoreHorizontal className="size-5" aria-hidden />
          </button>
        </div>
        <p className="mt-1 text-sm text-muted">{t("itemsCount", { count: loc.totalItems })}</p>
      </div>

      {isHere ? (
        <div className="flex items-center gap-2">
          <p className="flex min-h-11 flex-1 items-center gap-2 rounded-xl bg-surface px-4 font-medium text-accent">
            <Check className="size-5" aria-hidden />
            {tHere("youAreHere")}
          </p>
          <Button onClick={() => setCurrentLocationId(null)} aria-label={tHere("reset")}>
            {tHere("resetShort")}
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          <Button variant="primary" onClick={() => setCurrentLocationId(id)} className="w-full">
            <MapPin className="size-5" aria-hidden />
            {tHere("setHere")}
          </Button>
          <p className="text-center text-sm text-muted">{tHere("hint")}</p>
        </div>
      )}

      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-semibold">{t("nested")}</h2>
          <Button variant="ghost" onClick={() => openCreate(id)} className="-mr-3">
            <Plus className="size-5" aria-hidden />
            {t("addInside")}
          </Button>
        </div>
        {nested.length === 0 ? (
          <p className="text-muted">{t("noNested")}</p>
        ) : (
          <ul className="-mx-2 flex flex-col">
            {nested.map((child) => (
              <li key={child.id}>
                <Link
                  href={`/locations/${child.id}`}
                  className="flex min-h-12 items-center gap-2 rounded-xl px-2 active:bg-surface"
                >
                  <span className="min-w-0 flex-1 truncate">{name(child)}</span>
                  {current?.id === child.id && <MapPin className="size-4 text-accent" aria-label={tHere("youAreHere")} />}
                  <span className="text-sm text-muted tabular-nums">{t("itemsCount", { count: child.totalItems })}</span>
                  <ChevronRight className="size-5 text-muted" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-semibold">{t("items")}</h2>
        <p className="flex items-center gap-2 rounded-2xl border border-dashed border-border p-6 text-muted">
          <Package className="size-5 shrink-0" aria-hidden />
          {t("noItems")}
        </p>
      </section>
    </div>
  );
}
