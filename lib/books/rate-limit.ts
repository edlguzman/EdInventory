import "server-only";

/** Catalogue requests (book lookup, cover) per user per minute, shared by both routes. */
const PER_MINUTE = 30;
const recent = new Map<string, number[]>();

/**
 * True when this user made PER_MINUTE catalogue requests in the last minute. In memory of one
 * server instance: a brake against loops and abuse, not an exact limit.
 */
export function catalogueRateLimited(userId: string): boolean {
  const now = Date.now();
  const list = (recent.get(userId) ?? []).filter((t) => now - t < 60_000);
  if (list.length >= PER_MINUTE) return true;
  list.push(now);
  recent.set(userId, list);
  if (recent.size > 5000) recent.clear();
  return false;
}
