"use server";

import { z } from "zod";
import { listItems } from "@/lib/items/data";
import { ITEMS_PAGE_SIZE, type ItemSummary } from "@/lib/items/types";

const inputSchema = z.object({
  category: z.union([z.literal("none"), z.uuid()]).nullable(),
  location: z.uuid().nullable(),
  expiry: z.enum(["soon", "expired"]).nullable().optional(),
  kind: z.enum(["book", "medicine"]).nullable().optional(),
  offset: z.number().int().min(0).max(5000),
});

/**
 * The next page of the Items list (infinite scroll): the same filters and order as the page,
 * starting at `offset`. RLS applies; only the user's own items come back.
 */
export async function loadMoreItems(input: z.input<typeof inputSchema>): Promise<{ items: ItemSummary[]; hasMore: boolean } | null> {
  const v = inputSchema.safeParse(input);
  if (!v.success) return null;
  try {
    return await listItems({
      category: v.data.category ?? undefined,
      location: v.data.location ?? undefined,
      expiry: v.data.expiry ?? undefined,
      kind: v.data.kind ?? undefined,
      limit: ITEMS_PAGE_SIZE,
      offset: v.data.offset,
    });
  } catch {
    return null;
  }
}
