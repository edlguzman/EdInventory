"use client";

import { SerwistProvider } from "@serwist/turbopack/react";

/**
 * Registers the service worker (/serwist/sw.js) in production.
 * cacheOnNavigation is off: pages are per user and must never be cached (see lib/pwa/sw.ts).
 * reloadOnOnline is off: an automatic reload could throw away a half-filled form.
 */
export function PwaProvider({ children }: { children: React.ReactNode }) {
  return (
    <SerwistProvider
      swUrl="/serwist/sw.js"
      disable={process.env.NODE_ENV !== "production"}
      cacheOnNavigation={false}
      reloadOnOnline={false}
    >
      {children}
    </SerwistProvider>
  );
}
