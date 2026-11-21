"use client";

import { useState } from "react";
import { HelpButton } from "@/components/help/help-sheet";
import { MapPin, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { HeaderBack } from "@/components/back-button";
import { LocationPicker } from "@/components/locations/location-picker";
import { useCurrentLocation, useLocations, useSetCurrentLocation } from "@/components/locations/locations-context";

/** Shortens "A → B → C → D" to "… → C → D" so the end of the path stays visible. */
function shortPath(full: string) {
  const parts = full.split(" → ");
  return parts.length > 2 ? `… → ${parts.slice(-2).join(" → ")}` : full;
}

/** "I'm here" bar at the top of every (app) screen. */
export function CurrentLocationBar() {
  const t = useTranslations("here");
  const { path } = useLocations();
  const current = useCurrentLocation();
  const setCurrentLocationId = useSetCurrentLocation();
  const [picking, setPicking] = useState(false);

  return (
    <div className="sticky top-0 z-30 border-b border-border bg-background/95 pt-[env(safe-area-inset-top)] backdrop-blur">
      <div className="mx-auto flex max-w-2xl items-center gap-1 px-2">
        <HeaderBack />
        <button
          type="button"
          onClick={() => setPicking(true)}
          aria-label={current ? `${t("change")}: ${path(current)}` : t("pickerTitle")}
          className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-xl px-2 text-left text-sm"
        >
          <MapPin className={`size-5 shrink-0 ${current ? "text-accent" : "text-muted"}`} aria-hidden />
          {current ? (
            <span className="truncate font-medium" title={path(current)}>
              {shortPath(path(current))}
            </span>
          ) : (
            <span className="truncate text-muted">
              {t("none")} · <span className="font-medium text-accent">{t("choose")}</span>
            </span>
          )}
        </button>
        {current && (
          <button
            type="button"
            onClick={() => setCurrentLocationId(null)}
            aria-label={t("reset")}
            className="flex size-11 shrink-0 items-center justify-center rounded-xl text-muted"
          >
            <X className="size-5" aria-hidden />
          </button>
        )}
        <HelpButton />
      </div>
      <LocationPicker
        open={picking}
        onClose={() => setPicking(false)}
        title={t("pickerTitle")}
        initialId={current?.id ?? null}
        onSelect={(id) => {
          setCurrentLocationId(id);
          setPicking(false);
        }}
      />
    </div>
  );
}
