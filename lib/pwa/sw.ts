/// <reference no-default-lib="true" />
/// <reference lib="esnext" />
/// <reference lib="webworker" />
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { CacheFirst, ExpirationPlugin, NetworkOnly, Serwist } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

/**
 * Service worker: makes the app installable and shows /offline without a network.
 *
 * Deliberately NOT cached (decided in stage 7):
 * - pages and RSC payloads: they are per user; on a shared phone a cached page could show
 *   the previous user's data after sign-out;
 * - /api/* and Supabase: live data and auth;
 * - photos: 1-hour signed URLs, a cached copy would go stale.
 * Only hashed static build files, fonts and icons are cached.
 */
const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    {
      // Hashed build output never changes under the same URL.
      matcher: ({ url, sameOrigin }) => sameOrigin && url.pathname.startsWith("/_next/static/"),
      handler: new CacheFirst({
        cacheName: "next-static",
        plugins: [new ExpirationPlugin({ maxEntries: 300, maxAgeSeconds: 365 * 24 * 60 * 60 })],
      }),
    },
    {
      matcher: ({ url, sameOrigin }) => sameOrigin && (url.pathname.startsWith("/icons/") || /\.(?:svg|ico|woff2?)$/.test(url.pathname)),
      handler: new CacheFirst({
        cacheName: "app-assets",
        plugins: [new ExpirationPlugin({ maxEntries: 50, maxAgeSeconds: 30 * 24 * 60 * 60 })],
      }),
    },
    // Everything else (pages, RSC, /api, Supabase, photos) goes to the network only.
    { matcher: () => true, handler: new NetworkOnly() },
  ],
  fallbacks: {
    entries: [{ url: "/offline", matcher: ({ request }) => request.destination === "document" }],
  },
});

serwist.addEventListeners();
