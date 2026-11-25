import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { UsageSettingsForm } from "@/components/admin/usage";
import { PageTitle } from "@/components/page-title";
import { getUsageSettings } from "@/lib/admin/data";
import { requireAdmin } from "@/lib/auth";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin");
  return { title: t("usageSettings") };
}

/** Admin → Usage and prices: the storage limit and AI prices per model. The owner only (404). */
export default async function AdminUsageSettingsPage() {
  await requireAdmin("owner");
  const [t, settings] = await Promise.all([getTranslations("admin"), getUsageSettings()]);
  return (
    <>
      <PageTitle>{t("usageSettings")}</PageTitle>
      <UsageSettingsForm settings={settings} />
    </>
  );
}
