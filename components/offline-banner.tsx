"use client";

import { useSyncExternalStore } from "react";
import { WifiOff } from "lucide-react";
import { useTranslations } from "next-intl";

function subscribe(onChange: () => void) {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

/** true while the browser reports no network (server render: assume online). */
export function useOffline() {
  return useSyncExternalStore(subscribe, () => !navigator.onLine, () => false);
}

/** Thin bar under the header while offline: data lives on the server, so saving and AI wait for the network. */
export function OfflineBanner() {
  const t = useTranslations("offline");
  const offline = useOffline();
  if (!offline) return null;
  return (
    <p
      role="status"
      className="sticky top-11 z-20 flex items-center justify-center gap-2 bg-amber-100 px-4 py-2 text-center text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200"
    >
      <WifiOff className="size-4 shrink-0" aria-hidden />
      {t("banner")}
    </p>
  );
}
