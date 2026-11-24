import { z } from "zod";
import { getTranslations } from "next-intl/server";
import { ItemsBrowser } from "@/components/items/items-browser";
import { expiryCounts, getCategories, listItems } from "@/lib/items/data";
import { isExpiryFilter } from "@/lib/items/expiry-filter";
import { isKindFilter, showsExpiry } from "@/lib/items/kind-filter";
import { ITEMS_PAGE_SIZE } from "@/lib/items/types";

const PAGE_SIZE = ITEMS_PAGE_SIZE;
const MAX_LIMIT = 480;

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function ItemsPage({ searchParams }: PageProps<"/">) {
  const t = await getTranslations("items");
  const params = await searchParams;

  // Filters live in the URL, so back/forward and reload keep them. Invalid values are ignored.
  const rawCategory = one(params.category);
  const category = rawCategory === "none" || z.uuid().safeParse(rawCategory).success ? rawCategory! : null;
  // location: a place id, or "all" (chosen explicitly). Without it the client opens the list
  // on "I'm here" (stored on the device, so only the client knows it).
  const rawLocation = one(params.location);
  const location = z.uuid().safeParse(rawLocation).success ? rawLocation! : null;
  const rawKind = one(params.kind);
  const kind = isKindFilter(rawKind) ? rawKind : null;
  // Types without expiry dates (books) ignore the expiry filter, also in an old link.
  const rawExpiry = one(params.expiry);
  const expiry = isExpiryFilter(rawExpiry) && showsExpiry(kind) ? rawExpiry : null;
  const n = Number.parseInt(one(params.n) ?? "", 10);
  const limit = Number.isFinite(n) ? Math.min(Math.max(PAGE_SIZE, n), MAX_LIMIT) : PAGE_SIZE;

  const [{ items, hasMore, total }, categories, expiring] = await Promise.all([
    listItems({ category: category ?? undefined, location: location ?? undefined, expiry: expiry ?? undefined, kind: kind ?? undefined, limit }),
    getCategories(),
    // All places and categories: an expiring medicine anywhere is worth knowing about.
    showsExpiry(kind) ? expiryCounts({ kind: kind ?? undefined }) : { expired: 0, soon: 0 },
  ]);

  return (
    <ItemsBrowser
      // New filters or changed data: a fresh list (pages loaded by scrolling start over).
      key={`${category}|${location}|${expiry}|${kind}|${items.length}|${items[0]?.id ?? ""}|${items.at(-1)?.id ?? ""}`}
      title={t("title")}
      items={items}
      hasMore={hasMore}
      total={total ?? items.length}
      categories={categories}
      filters={{ category, location, expiry, kind, limit }}
      expiring={expiring}
      pageSize={PAGE_SIZE}
    />
  );
}
