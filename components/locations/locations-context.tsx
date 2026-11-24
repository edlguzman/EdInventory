"use client";

import { useDataLang } from "@/components/data-lang/context";
import { createContext, use, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { createLocalStore } from "@/lib/local-store";
import type { Slot } from "@/lib/data-lang";
import { name as nameOf, path as pathOf, type LocationNode } from "@/lib/locations/types";

type LocationsValue = {
  all: LocationNode[];
  /** Slot names are shown in. */
  locale: Slot;
  byId: Map<string, LocationNode>;
  /** Children of a place (null = top level), sorted alphabetically in the current language. */
  childrenOf: (parentId: string | null) => LocationNode[];
  /** The place itself and all its descendants. */
  subtreeIds: (id: string) => Set<string>;
  name: (loc: LocationNode) => string;
  path: (loc: LocationNode) => string;
  /** The signed-in user (keys of per-user device state, photo folders). */
  userId: string;
  /** "I'm here" of the signed-in user on this device. */
  here: HereStore;
};

const LocationsContext = createContext<LocationsValue | null>(null);

export function LocationsProvider({
  locations,
  userId,
  children,
}: {
  locations: LocationNode[];
  userId: string;
  children: React.ReactNode;
}) {
  const { display: locale, lang } = useDataLang();
  const here = useMemo(() => hereStoreFor(userId), [userId]);

  const value = useMemo<LocationsValue>(() => {
    const collator = new Intl.Collator(locale === "en" ? "en" : lang, { sensitivity: "base", numeric: true });
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
      userId,
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
      here,
    };
  }, [locations, userId, locale, lang, here]);

  return <LocationsContext value={value}>{children}</LocationsContext>;
}

export function useLocations() {
  const ctx = use(LocationsContext);
  if (!ctx) throw new Error("useLocations must be used inside LocationsProvider");
  return ctx;
}

// --- "I'm here": current place, stored on the device, per user ---------------------
//
// The key includes the user id: several accounts on one device (own + test account) must not
// overwrite each other's place. The place is never erased automatically when it is missing from
// the list (another account, a list not refreshed yet after creating a place): the user changes
// or resets it, or it is cleared when that place is deleted here.

const LEGACY_KEY = "inventory.currentLocationId";
const parseId = (raw: unknown) => (typeof raw === "string" ? raw : undefined);

type HereStore = ReturnType<typeof createLocalStore<string | null>>;
const hereStores = new Map<string, HereStore>();

function hereStoreFor(userId: string): HereStore {
  let store = hereStores.get(userId);
  if (!store) {
    store = createLocalStore<string | null>(`${LEGACY_KEY}.${userId}`, null, parseId);
    hereStores.set(userId, store);
  }
  return store;
}

const legacyStore = createLocalStore<string | null>(LEGACY_KEY, null, parseId);

/** Sets or resets "I'm here" for the signed-in user. */
export function useSetCurrentLocation() {
  return useLocations().here.set;
}

/** Ids already refreshed for: a place missing from the list asks the server once for a fresh list. */
const refreshedFor = new Set<string>();

/** Current place ("I'm here") of the signed-in user, or null. */
export function useCurrentLocation(): LocationNode | null {
  const { byId, here } = useLocations();
  const id = here.useValue();
  const legacy = legacyStore.useValue();
  const router = useRouter();
  const node = id ? (byId.get(id) ?? null) : null;

  useEffect(() => {
    // One-time move from the old device-wide key, only into the account that owns that place.
    if (!id && legacy && byId.has(legacy)) {
      here.set(legacy);
      legacyStore.set(null);
    }
  }, [id, legacy, byId, here]);

  useEffect(() => {
    // Not in the list: maybe created a moment ago and the list is stale. Refresh once; never erase.
    if (id && !node && !refreshedFor.has(id)) {
      refreshedFor.add(id);
      router.refresh();
    }
  }, [id, node, router]);

  return node;
}

/**
 * The place of a NEW item (item form, "several items"): it is "I'm here" itself, so choosing
 * or clearing it there changes "I'm here" everywhere (header, other screens, next items).
 * A place created a moment ago (voice: "create … inside …") counts at once, before the list
 * of places has been refreshed.
 */
export function useHerePlace(): [string | null, (id: string | null) => void] {
  const node = useCurrentLocation();
  const { here } = useLocations();
  const raw = here.useValue();
  const [justSet, setJustSet] = useState<string | null>(null);
  const set = useCallback(
    (id: string | null) => {
      setJustSet(id);
      here.set(id);
    },
    [here],
  );
  return [node?.id ?? (raw && raw === justSet ? raw : null), set];
}
