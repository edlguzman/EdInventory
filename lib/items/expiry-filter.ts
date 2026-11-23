import { addDaysIso, EXPIRY_SOON_DAYS, todayIso } from "@/lib/medicines/expiry";

/** Expiry filter of the Items list: expires within 30 days (not yet expired) / already expired. */
export type ExpiryFilter = "soon" | "expired";

export const isExpiryFilter = (v: unknown): v is ExpiryFilter => v === "soon" || v === "expired";

/** The date range of a filter (YYYY-MM-DD, inclusive), for gte/lte on items.expires_on. */
export function expiryRange(f: ExpiryFilter, today = todayIso()): { gte?: string; lte?: string; lt?: string } {
  return f === "expired" ? { lt: today } : { gte: today, lte: addDaysIso(today, EXPIRY_SOON_DAYS) };
}

type Filterable<Q> = { gte(col: string, v: string): Q; lte(col: string, v: string): Q; lt(col: string, v: string): Q };

/** Adds the filter's conditions on expires_on to a PostgREST query. */
export function withExpiry<Q extends Filterable<Q>>(query: Q, f: ExpiryFilter | null | undefined): Q {
  if (!f) return query;
  const r = expiryRange(f);
  let q = query;
  if (r.lt) q = q.lt("expires_on", r.lt);
  if (r.gte) q = q.gte("expires_on", r.gte);
  if (r.lte) q = q.lte("expires_on", r.lte);
  return q;
}
