import { randomUUID } from "node:crypto";
import { createSerwistRoute } from "@serwist/turbopack";

// Builds and serves the service worker at /serwist/sw.js (Serwist's Turbopack integration).
export const { dynamic, dynamicParams, revalidate, generateStaticParams, GET } = createSerwistRoute({
  swSrc: "lib/pwa/sw.ts",
  // Native esbuild on every platform (installed as a dependency, works on Vercel too).
  useNativeEsbuild: true,
  // The offline screen is precached; a new revision every build refreshes it.
  additionalPrecacheEntries: [{ url: "/offline", revision: randomUUID() }],
  // Keep the precache small: big lazy chunks (e.g. the HEIC decoder) load on demand instead.
  maximumFileSizeToCacheInBytes: 1024 * 1024,
});
