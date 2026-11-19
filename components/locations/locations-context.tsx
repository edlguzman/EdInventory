"use client";

import { createContext, use, useEffect, useMemo } from "react";
import { useLocale } from "next-intl";
import { createLocalStore } from "@/lib/local-store";
import { name as nameOf, path as pathOf, type Locale, type LocationNode } from "@/lib/locations/types";

type LocationsValue = {
  all: LocationNode[];
  locale: Locale;
  byId: Map<string, LocationNode>;
  /** Children of a place (null = top level), sorted alphabetically in the current language. */
  childrenOf: (parentId: string | null) => LocationNode[];
  /** The place itself and all its descendants. */
  subtreeIds: (id: string) => Set<string>;
  name: (loc: LocationNode) => string;
  path: (loc: LocationNode) => string;
};

const LocationsContext = createContext<LocationsValue | null>(null);

export function LocationsProvider({ locations, children }: { locations: LocationNode[]; children: React.ReactNode }) {
  const locale = useLocale() as Locale;

  const value = useMemo<LocationsValue>(() => {
    const collator = new Intl.Collator(locale, { sensitivity: "base", numeric: true });
    const byId = new Map(locations.map((l) => [l.id, l]));
    const children = new Map<string | null, LocationNode[]>();
    for (const l of locations) {
      const list = children.get(l.parentId) ?? [];
      list.push(l);
      children.set(l.parentId, list);
    }
    for (const list of children.values()) list.sort((a, b) => collator.compare(nameOf(a, locale), nameOf(b, locale)));

    return {
      all: locations,
      locale,
      byId,
      childrenOf: (parentId) => children.get(parentId) ?? [],
      subtreeIds: (id) => {
        const result = new Set<string>([id]);
        const stack = [id];
        while (stack.length) {
          for (const c of children.get(stack.pop()!) ?? []) {
            result.add(c.id);
            stack.push(c.id);
          }
        }
        return result;
      },
      name: (loc) => nameOf(loc, locale),
      path: (loc) => pathOf(loc, locale),
    };
  }, [locations, locale]);

  return <LocationsContext value={value}>{children}</LocationsContext>;
}

export function useLocations() {
  const ctx = use(LocationsContext);
  if (!ctx) throw new Error("useLocations must be used inside LocationsProvider");
  return ctx;
}

// --- "I'm here": current place, stored on the device -------------------------

const currentStore = createLocalStore<string | null>("inventory.currentLocationId", null, (raw) =>
  typeof raw === "string" ? raw : undefined,
);

export const setCurrentLocationId = (id: string | null) => currentStore.set(id);

/** Current place ("I'm here"). Clears itself if the place no longer exists (deleted, other account). */
export function useCurrentLocation(): LocationNode | null {
  const id = currentStore.useValue();
  const { byId } = useLocations();
  const node = id ? (byId.get(id) ?? null) : null;

  useEffect(() => {
    if (id && !node) currentStore.set(null);
  }, [id, node]);

  return node;
}
