import type { Metadata } from "next";
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { PageTitle } from "@/components/page-title";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("settings");
  return { title: t("title") };
}

export default function SettingsPage() {
  const t = useTranslations("settings");
  return (
    <>
      <PageTitle>{t("title")}</PageTitle>
      <LocaleSwitcher />
    </>
  );
}
