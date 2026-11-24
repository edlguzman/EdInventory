"use client";

import { useCallback, useEffect, useState } from "react";
import { loadMoreItems } from "@/app/(app)/items/list-actions";
import type { ItemSummary } from "@/lib/items/types";

type Loaded = { items: ItemSummary[]; hasMore: boolean };

/**
 * Pages loaded by scrolling, kept for this tab session per filter (key) and first page (sig).
 * Coming back to the list (back arrow, swipe) shows everything that was loaded at once, so the
 * browser can restore the scroll position even far down the list.
 */
const loadedCache = new Map<string, Loaded & { sig: string }>();

/** After a bulk change (or its undo) the loaded pages are stale: the next render starts over. */
export function forgetLoadedItems() {
  loadedCache.clear();
}

/**
 * Infinite scroll for the Items list: the server renders the first page; the next pages are
 * fetched with a server action when the sentinel comes near the screen, and appended
 * (already shown cards are not rendered again).
 */
export function useMoreItems({
  filterKey,
  category,
  location,
  expiry,
  kind,
  initial,
  initialHasMore,
}: {
  filterKey: string;
  category: string | null;
  location: string | null;
  expiry: "soon" | "expired" | null;
  kind: "book" | "medicine" | null;
  initial: ItemSummary[];
  initialHasMore: boolean;
}) {
  const sig = `${initial.length}:${initial[0]?.id ?? ""}:${initial.at(-1)?.id ?? ""}`;
  const [state, setState] = useState<Loaded>(() => {
    const cached = loadedCache.get(filterKey);
    return cached && cached.sig === sig ? { items: cached.items, hasMore: cached.hasMore } : { items: initial, hasMore: initialHasMore };
  });
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  const loadMore = useCallback(async () => {
    // A second call while loading is ignored; a duplicate page would be dropped by id anyway.
    if (loading || !state.hasMore) return;
    setLoading(true);
    setFailed(false);
    const r = await loadMoreItems({ category, location, expiry, kind, offset: state.items.length }).catch(() => null);
    setLoading(false);
    if (!r) return setFailed(true);
    setState((s) => {
      const seen = new Set(s.items.map((i) => i.id));
      const next = { items: [...s.items, ...r.items.filter((i) => !seen.has(i.id))], hasMore: r.hasMore };
      loadedCache.set(filterKey, { ...next, sig });
      return next;
    });
  }, [category, location, expiry, kind, filterKey, sig, loading, state.hasMore, state.items.length]);

  // The sentinel after the list (a callback ref): load the next page about a screen before the end.
  const [sentinel, setSentinel] = useState<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = sentinel;
    if (!el || !state.hasMore || failed) return;
    const io = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && void loadMore(), {
      rootMargin: "0px 0px 900px 0px",
    });
    io.observe(el);
    return () => io.disconnect();
  }, [sentinel, loadMore, state.hasMore, failed]);

  return { items: state.items, hasMore: state.hasMore, loading, failed, loadMore, setSentinel };
}
