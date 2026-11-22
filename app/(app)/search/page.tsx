import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { SearchView } from "@/components/search/search-view";
import { getCategories, searchItems } from "@/lib/items/data";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("search");
  return { title: t("title") };
}

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const uuidOrNull = (v: string) => (z.uuid().safeParse(v).success ? v : null);

/**
 * /search?q=… — instant text search (terms = the typed words, no AI).
 * /search?ai=1&q=<transcript>&t=<terms>&loc=&cat= — after the AI turned a question into terms and filters.
 * Both run the same database search (search_items_v4: a page plus the total found); items never go to Gemini.
 */
export default async function SearchPage({ searchParams }: PageProps<"/search">) {
  const params = await searchParams;
  const q = one(params.q).slice(0, 500);
  const ai = one(params.ai) === "1";
  const aiTerms = one(params.t)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 20);
  const terms = ai && aiTerms.length ? aiTerms : q.split(/\s+/).filter((w) => w.length >= 2).slice(0, 10);
  const location = ai ? uuidOrNull(one(params.loc)) : null;
  const category = ai ? uuidOrNull(one(params.cat)) : null;

  const [results, categories] = await Promise.all([
    terms.length ? searchItems({ terms, location, category }) : Promise.resolve(null),
    getCategories(),
  ]);

  return (
    <SearchView
      q={q}
      ai={ai ? { terms: aiTerms, location, category } : null}
      results={results?.items ?? null}
      total={results ? (results.total ?? results.items.length) : 0}
      query={{ terms, location, category }}
      categories={categories}
    />
  );
}
