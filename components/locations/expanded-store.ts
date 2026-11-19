"use client";

import { createLocalStore } from "@/lib/local-store";

/** Which branches of the place tree are expanded; remembered on the device. */
export const expandedStore = createLocalStore<string[]>("inventory.expandedLocations", [], (raw) =>
  Array.isArray(raw) && raw.every((x) => typeof x === "string") ? raw : undefined,
);

export function toggleExpanded(id: string) {
  const current = expandedStore.get();
  expandedStore.set(current.includes(id) ? current.filter((x) => x !== id) : [...current, id]);
}

export function expandAll(ids: string[]) {
  const current = expandedStore.get();
  const missing = ids.filter((id) => !current.includes(id));
  if (missing.length) expandedStore.set([...current, ...missing]);
}
