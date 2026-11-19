import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

// cacheComponents/partialPrefetching intentionally disabled:
// every page is per-user (Supabase session + locale cookie), so a static
// shell gives little benefit while requiring Suspense around every cookie read.
const nextConfig: NextConfig = {
  // The floating dev indicator overlaps the header and bottom navigation on a phone screen;
  // build/runtime errors still show in the dev overlay.
  devIndicators: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

export default withNextIntl(nextConfig);
