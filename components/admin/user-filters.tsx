"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, LoaderCircle, Search, X } from "lucide-react";
import { useTranslations } from "next-intl";
import type { PlanRow } from "@/lib/admin/data";
import { USER_SORTS, USER_STATUSES, userFiltersHref, type UserFilters } from "@/lib/admin/filters";
import { usePlanName } from "./plan-controls";

const control =
  "min-h-11 w-full min-w-0 rounded-lg border border-border bg-background px-3 text-base text-foreground outline-none focus:border-accent";

/**
 * Search by email (while typing), status, plan and sorting. Every change replaces the address
 * (no new history entry), so "Back" leaves the section at once; any change goes to page 1.
 */
export function UserFiltersBar({ filters, plans }: { filters: UserFilters; plans: PlanRow[] }) {
  const t = useTranslations("admin");
  const router = useRouter();
  const planName = usePlanName(plans);
  const [pending, startTransition] = useTransition();
  const [q, setQ] = useState(filters.q);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const go = (patch: Partial<UserFilters>) =>
    startTransition(() => router.replace(userFiltersHref(filters, { ...patch, page: 1 }), { scroll: false }));

  // Typing: search after a short pause.
  const onSearch = (value: string) => {
    setQ(value);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => go({ q: value.trim() }), 350);
  };
  useEffect(() => () => clearTimeout(timer.current), []);

  return (
    <div className="flex flex-col gap-2">
      <label className="relative block">
        <span className="sr-only">{t("searchEmail")}</span>
        <Search className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-muted" aria-hidden />
        <input
          type="search"
          inputMode="email"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          value={q}
          onChange={(e) => onSearch(e.target.value)}
          placeholder={t("searchEmail")}
          className={`${control} pr-11 pl-10`}
        />
        {pending ? (
          <LoaderCircle className="absolute top-1/2 right-3 size-5 -translate-y-1/2 animate-spin text-muted" aria-hidden />
        ) : (
          q && (
            <button
              type="button"
              onClick={() => (setQ(""), clearTimeout(timer.current), go({ q: "" }))}
              aria-label={t("clearSearch")}
              className="absolute top-0 right-0 flex size-11 items-center justify-center text-muted"
            >
              <X className="size-5" aria-hidden />
            </button>
          )
        )}
      </label>
      <div className="grid grid-cols-3 gap-2">
        <label className="flex min-w-0 flex-col gap-1 text-xs text-muted">
          {t("filterStatus")}
          <select
            value={filters.status ?? ""}
            onChange={(e) => go({ status: (e.target.value || null) as UserFilters["status"] })}
            className={control}
          >
            <option value="">{t("all")}</option>
            {USER_STATUSES.map((s) => (
              <option key={s} value={s}>
                {t(`status.${s}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-w-0 flex-col gap-1 text-xs text-muted">
          {t("plan")}
          <select value={filters.plan ?? ""} onChange={(e) => go({ plan: e.target.value || null })} className={control}>
            <option value="">{t("all")}</option>
            {plans.map((p) => (
              <option key={p.code} value={p.code}>
                {planName(p.code)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-w-0 flex-col gap-1 text-xs text-muted">
          {t("sortBy")}
          <select value={filters.sort} onChange={(e) => go({ sort: e.target.value as UserFilters["sort"] })} className={control}>
            {USER_SORTS.map((s) => (
              <option key={s} value={s}>
                {t(`sort.${s}`)}
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}

/** "‹ 51–100 of 312 ›": pages replace the address, like the filters. */
export function UsersPager({ filters, total, pageSize }: { filters: UserFilters; total: number; pageSize: number }) {
  const t = useTranslations("admin");
  if (total === 0) return null;
  const from = (filters.page - 1) * pageSize + 1;
  const to = Math.min(filters.page * pageSize, total);
  const last = Math.ceil(total / pageSize);
  const btn = "flex size-11 items-center justify-center rounded-xl border border-border";
  return (
    <nav className="flex items-center justify-between gap-2" aria-label={t("pages")}>
      {filters.page > 1 ? (
        <Link replace href={userFiltersHref(filters, { page: filters.page - 1 })} className={btn} aria-label={t("prevPage")}>
          <ChevronLeft className="size-5" aria-hidden />
        </Link>
      ) : (
        <span className={`${btn} opacity-40`} aria-hidden>
          <ChevronLeft className="size-5" />
        </span>
      )}
      <span className="text-sm text-muted tabular-nums">{t("range", { from, to, total })}</span>
      {filters.page < last ? (
        <Link replace href={userFiltersHref(filters, { page: filters.page + 1 })} className={btn} aria-label={t("nextPage")}>
          <ChevronRight className="size-5" aria-hidden />
        </Link>
      ) : (
        <span className={`${btn} opacity-40`} aria-hidden>
          <ChevronRight className="size-5" />
        </span>
      )}
    </nav>
  );
}
