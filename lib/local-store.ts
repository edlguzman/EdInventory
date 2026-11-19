"use client";

import { useSyncExternalStore } from "react";

/**
 * A tiny localStorage-backed store for per-device UI state.
 * - SSR-safe: the server snapshot is the fallback, so hydration never mismatches.
 * - Syncs between components and between browser tabs ("storage" event).
 * - Survives a blocked/unavailable localStorage (private mode): falls back to memory.
 */
export function createLocalStore<T>(key: string, fallback: T, parse: (raw: unknown) => T | undefined) {
  const listeners = new Set<() => void>();
  let memory: string | null = null;
  let cachedRaw: string | null | undefined;
  let cachedValue: T = fallback;

  function readRaw(): string | null {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return memory;
    }
  }

  function getSnapshot(): T {
    const raw = readRaw();
    if (raw !== cachedRaw) {
      cachedRaw = raw;
      let value: T | undefined;
      try {
        value = raw === null ? undefined : parse(JSON.parse(raw));
      } catch {
        value = undefined;
      }
      cachedValue = value ?? fallback;
    }
    return cachedValue;
  }

  function set(value: T | null) {
    const raw = value === null ? null : JSON.stringify(value);
    memory = raw;
    try {
      if (raw === null) window.localStorage.removeItem(key);
      else window.localStorage.setItem(key, raw);
    } catch {
      // Storage unavailable: keep the value in memory for this page session.
    }
    listeners.forEach((l) => l());
  }

  function subscribe(listener: () => void) {
    listeners.add(listener);
    const onStorage = (e: StorageEvent) => {
      if (e.key === key) listener();
    };
    window.addEventListener("storage", onStorage);
    return () => {
      listeners.delete(listener);
      window.removeEventListener("storage", onStorage);
    };
  }

  function useValue(): T {
    return useSyncExternalStore(subscribe, getSnapshot, () => fallback);
  }

  return { useValue, set, get: getSnapshot };
}
