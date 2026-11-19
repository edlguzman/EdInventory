import type { Metadata } from "next";
import { LogOut } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { signOut } from "@/app/(auth)/actions";
import { CategoryList } from "@/components/categories/category-list";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { PageTitle } from "@/components/page-title";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("settings");
  return { title: t("title") };
}

export default async function SettingsPage() {
  const user = await requireUser();
  const t = await getTranslations("settings");
  const supabase = await createClient();
  const { data: categories } = await supabase
    .from("categories")
    .select("id, name_ru, name_en")
    .order("sort_order")
    .order("created_at");

  return (
    <>
      <PageTitle>{t("title")}</PageTitle>
      <div className="flex flex-col gap-8">
        <LocaleSwitcher />

        <CategoryList categories={categories ?? []} />

        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-medium text-muted">{t("account")}</h2>
          <p className="rounded-xl border border-border bg-surface px-4 py-3">
            <span className="block text-sm text-muted">{t("signedInAs")}</span>
            <span className="break-all font-medium">{user.email}</span>
          </p>
          <form action={signOut}>
            <button
              type="submit"
              className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-border px-4 font-medium text-red-600 dark:text-red-400"
            >
              <LogOut className="size-5" aria-hidden />
              {t("signOut")}
            </button>
          </form>
        </section>
      </div>
    </>
  );
}
