import { z } from "zod";
import { getTranslations } from "next-intl/server";
import { ItemsBrowser } from "@/components/items/items-browser";
import { getCategories, listItems } from "@/lib/items/data";

const PAGE_SIZE = 48;
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
  const n = Number.parseInt(one(params.n) ?? "", 10);
  const limit = Number.isFinite(n) ? Math.min(Math.max(PAGE_SIZE, n), MAX_LIMIT) : PAGE_SIZE;

  const [{ items, hasMore }, categories] = await Promise.all([
    listItems({ category: category ?? undefined, location: location ?? undefined, limit }),
    getCategories(),
  ]);

  return (
    <ItemsBrowser
      title={t("title")}
      items={items}
      hasMore={hasMore}
      categories={categories}
      filters={{ category, location, limit }}
      pageSize={PAGE_SIZE}
    />
  );
}
