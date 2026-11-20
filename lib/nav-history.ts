"use client";

import { useSyncExternalStore } from "react";

/**
 * In-app back navigation.
 *
 * Every history entry the app creates is stamped with its index in this tab's app session
 * (`history.state.__inventoryIdx`): pushState gets the next index, replaceState keeps the
 * current one (Next.js rebuilds history.state on replace, so the stamp is re-applied each
 * time). After back/forward the index is read from the entry itself. Index > 0 means the
 * previous entry is a screen of this app, so "Back" can be a real history step (filters,
 * view and scroll come back, iOS swipe-back stays in sync). Index 0 — the first screen
 * opened in this tab (a link, the installed app's start) — "Back" goes to the screen's parent.
 * Entries survive a reload, so a reloaded screen still steps back to the app screen before it.
 */

const KEY = "__inventoryIdx";
let installed = false;
let current = 0;

type State = Record<string, unknown> | null | undefined;
const stamp = (state: unknown, idx: number) => ({ ...((state as State) ?? {}), [KEY]: idx });
const readIdx = (state: unknown) => {
  const v = (state as State)?.[KEY];
  return typeof v === "number" && v >= 0 ? v : null;
};

/** Installs the stamping once per page load (idempotent). Call from a client effect. */
export function installNavHistory() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  const { history } = window;
  const push = history.pushState.bind(history);
  const replace = history.replaceState.bind(history);

  const existing = readIdx(history.state);
  current = existing ?? 0;
  if (existing === null) replace(stamp(history.state, 0), "");

  history.pushState = (state: unknown, unused: string, url?: string | URL | null) => {
    current += 1;
    return push(stamp(state, current), unused, url);
  };
  history.replaceState = (state: unknown, unused: string, url?: string | URL | null) =>
    replace(stamp(state, current), unused, url);
  window.addEventListener("popstate", (e) => {
    current = readIdx(e.state) ?? 0;
  });
}

/** True when the previous history entry is a screen of this app (a real "back" is possible). */
export function canGoBackInApp() {
  return installed && current > 0;
}

// --- Screen-level "back" handler (states inside one route, e.g. "several items") ---------

type Handler = () => void;
let override: Handler | null = null;
const listeners = new Set<() => void>();

/** A screen state (not a route) can take over the header's back arrow; null releases it. */
export function setBackOverride(handler: Handler | null) {
  override = handler;
  listeners.forEach((l) => l());
}

export function useBackOverride(): Handler | null {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => override,
    () => null,
  );
}
