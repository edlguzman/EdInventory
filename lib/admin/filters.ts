/** Filters of /admin/users, kept in the address (shared by the server page and the client controls). */

export const USERS_PAGE_SIZE = 50;
export const USER_STATUSES = ["pending", "active", "disabled"] as const;
export const USER_SORTS = ["new", "old", "email", "items", "storage", "ai", "seen"] as const;

export type UserStatus = (typeof USER_STATUSES)[number];
export type UserSort = (typeof USER_SORTS)[number];
export type UserFilters = { q: string; status: UserStatus | null; plan: string | null; sort: UserSort; page: number };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export function parseUserFilters(sp: Record<string, string | string[] | undefined>): UserFilters {
  const status = one(sp.status);
  const sort = one(sp.sort);
  const plan = one(sp.plan);
  const page = Number.parseInt(one(sp.page), 10);
  return {
    q: one(sp.q).trim().slice(0, 100),
    status: (USER_STATUSES as readonly string[]).includes(status) ? (status as UserStatus) : null,
    plan: /^[a-z0-9_]{1,32}$/.test(plan) ? plan : null,
    sort: (USER_SORTS as readonly string[]).includes(sort) ? (sort as UserSort) : "new",
    page: Number.isFinite(page) && page > 1 ? Math.min(page, 10_000) : 1,
  };
}

/** /admin/users with these filters (defaults left out of the address). */
export function userFiltersHref(f: UserFilters, patch: Partial<UserFilters> = {}) {
  const v = { ...f, ...patch };
  const p = new URLSearchParams();
  if (v.q) p.set("q", v.q);
  if (v.status) p.set("status", v.status);
  if (v.plan) p.set("plan", v.plan);
  if (v.sort !== "new") p.set("sort", v.sort);
  if (v.page > 1) p.set("page", String(v.page));
  const s = p.toString();
  return s ? `/admin/users?${s}` : "/admin/users";
}
