"use client";

import { useSyncExternalStore } from "react";

const subscribeNever = () => () => {};

/**
 * The viewer's time zone, or null during the server render. The server (Vercel) runs in
 * UTC, so dates are formatted only in the browser; render a placeholder while it is null.
 */
export function useTimeZone() {
  return useSyncExternalStore(
    subscribeNever,
    () => Intl.DateTimeFormat().resolvedOptions().timeZone,
    () => null,
  );
}
