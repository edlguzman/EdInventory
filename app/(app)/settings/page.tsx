import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, CircleHelp, LogOut, ShieldCheck } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { signOut } from "@/app/(auth)/actions";
import { CategoryList } from "@/components/categories/category-list";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { PageTitle } from "@/components/page-title";
import { DbHeartbeat } from "@/components/settings/db-heartbeat";
import { DataLangSettings } from "@/components/settings/data-lang-settings";
import { DeleteAccount } from "@/components/settings/delete-account";
import { getPendingCount } from "@/lib/admin/data";
import { getProfile, requireUser } from "@/lib/auth";
import { promptLangs } from "@/lib/data-lang";
import { createClient } from "@/lib/supabase/server";
import { countMissing } from "@/lib/translate/records";

/** The cron runs daily; more than two days without a check means it is not running. */
function isStale(at: string | null) {
  return !at || Date.now() - new Date(at).getTime() > 2 * 24 * 60 * 60 * 1000;
}

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("settings");
  return { title: t("title") };
}

export default async function SettingsPage() {
  const user = await requireUser();
  const t = await getTranslations("settings");
  const tNav = await getTranslations("nav");
  const profile = await getProfile();
  const supabase = await createClient();
  const [{ data: categories }, { data: status }, pendingCount, untranslated] = await Promise.all([
    supabase.from("categories").select("id, name_ru, name_en").order("sort_order").order("created_at"),
    supabase.from("system_status").select("last_keepalive_at").maybeSingle(),
    profile?.isAdmin ? getPendingCount() : 0,
    countMissing(supabase, promptLangs(profile?.dataLang ?? "en")),
  ]);

  return (
    <>
      <PageTitle>{t("title")}</PageTitle>
      <div className="flex flex-col gap-8">
        {profile?.isAdmin && (
          <Link
            href="/admin"
            className="flex min-h-12 items-center gap-3 rounded-xl border border-border bg-surface px-4 font-medium"
          >
            <ShieldCheck className="size-5 text-accent" aria-hidden />
            <span className="flex-1">{t("admin")}</span>
            {pendingCount > 0 && (
              <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-red-600 px-1.5 text-xs font-semibold text-white">
                <span aria-hidden>{pendingCount}</span>
                <span className="sr-only">{tNav("pendingBadge", { n: pendingCount })}</span>
              </span>
            )}
            <ChevronRight className="size-5 text-muted" aria-hidden />
          </Link>
        )}

        <LocaleSwitcher />

        <DataLangSettings untranslated={untranslated} />

        <CategoryList categories={categories ?? []} />

        <Link
          href="/help"
          className="flex min-h-12 items-center gap-3 rounded-xl border border-border bg-surface px-4 font-medium"
        >
          <CircleHelp className="size-5 text-accent" aria-hidden />
          <span className="flex-1">{t("help")}</span>
          <ChevronRight className="size-5 text-muted" aria-hidden />
        </Link>

        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-medium text-muted">{t("account")}</h2>
          <p className="rounded-xl border border-border bg-surface px-4 py-3">
            <span className="block text-sm text-muted">{t("signedInAs")}</span>
            <span className="break-all font-medium">{user.email}</span>
          </p>
          <form action={signOut}>
            <button
              type="submit"
              className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-border px-4 font-medium"
            >
              <LogOut className="size-5" aria-hidden />
              {t("signOut")}
            </button>
          </form>
          <DeleteAccount />
        </section>

        <section className="flex flex-col gap-2 border-t border-border pt-4">
          <DbHeartbeat at={status?.last_keepalive_at ?? null} stale={isStale(status?.last_keepalive_at ?? null)} />
        </section>
      </div>
    </>
  );
}
