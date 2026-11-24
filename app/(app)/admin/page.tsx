import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, CircleDollarSign, Tags, Users } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { UsageCards } from "@/components/admin/usage";
import { PageTitle } from "@/components/page-title";
import { getOverview, getUsageOverview } from "@/lib/admin/data";
import { requireAdmin } from "@/lib/auth";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin");
  return { title: t("title") };
}

/**
 * Admin home: Users, Plans, usage (storage, AI cost over 30 days) and its settings. Anyone but the admin gets 404 (requireAdmin);
 * the database functions behind every admin screen check the role again on each call.
 */
export default async function AdminPage() {
  await requireAdmin();
  const [t, overview, usage] = await Promise.all([getTranslations("admin"), getOverview(), getUsageOverview()]);

  const card = "flex min-h-28 items-center gap-4 rounded-2xl border border-border p-4 active:opacity-80";
  return (
    <>
      <PageTitle>{t("title")}</PageTitle>
      <div className="grid gap-3 sm:grid-cols-2">
        <Link href="/admin/users" className={card}>
          <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-surface text-accent">
            <Users className="size-6" aria-hidden />
          </span>
          <span className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="text-lg font-semibold">{t("usersSection")}</span>
            <span className="text-sm text-muted">{t("usersCount", { count: overview.users })}</span>
            {overview.pending > 0 && (
              <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-red-600 px-2 py-0.5 text-sm font-semibold text-white">
                {t("pendingCount", { count: overview.pending })}
              </span>
            )}
          </span>
          <ChevronRight className="size-5 shrink-0 text-muted" aria-hidden />
        </Link>
        <Link href="/admin/plans" className={card}>
          <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-surface text-accent">
            <Tags className="size-6" aria-hidden />
          </span>
          <span className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="text-lg font-semibold">{t("plans")}</span>
            <span className="text-sm text-muted">{t("plansCount", { count: overview.plans })}</span>
          </span>
          <ChevronRight className="size-5 shrink-0 text-muted" aria-hidden />
        </Link>
        <UsageCards usage={usage} />
        <Link href="/admin/settings" className={card}>
          <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-surface text-accent">
            <CircleDollarSign className="size-6" aria-hidden />
          </span>
          <span className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="text-lg font-semibold">{t("usageSettings")}</span>
            <span className="text-sm text-muted">{t("usageSettingsHint")}</span>
          </span>
          <ChevronRight className="size-5 shrink-0 text-muted" aria-hidden />
        </Link>
      </div>
      <p className="mt-6 text-sm text-muted">{t("privacy")}</p>
    </>
  );
}
