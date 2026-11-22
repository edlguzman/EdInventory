"use server";

import { z } from "zod";
import { searchItemIds, searchItems, SEARCH_PAGE_SIZE } from "@/lib/items/data";
import type { ItemSummary } from "@/lib/items/types";

const searchSchema = z.object({
  terms: z.array(z.string().max(60)).min(1).max(30),
  location: z.uuid().nullable(),
  category: z.uuid().nullable(),
});

/** The next page of search results (same terms and filters as the page). RLS applies. */
export async function loadMoreResults(
  input: z.input<typeof searchSchema> & { offset: number },
): Promise<{ items: ItemSummary[] } | null> {
  const v = searchSchema.extend({ offset: z.number().int().min(1).max(5000) }).safeParse(input);
  if (!v.success) return null;
  try {
    const r = await searchItems({ ...v.data, limit: SEARCH_PAGE_SIZE });
    return { items: r.items };
  } catch {
    return null;
  }
}

/** "Select all found": the ids of every result (rank order), up to 500, and the total. */
export async function selectAllResults(
  input: z.input<typeof searchSchema>,
): Promise<{ ids: string[]; total: number } | null> {
  const v = searchSchema.safeParse(input);
  if (!v.success) return null;
  try {
    const r = await searchItemIds({ ...v.data, limit: 500 });
    return { ids: r.ids, total: r.total ?? r.ids.length };
  } catch {
    return null;
  }
}
