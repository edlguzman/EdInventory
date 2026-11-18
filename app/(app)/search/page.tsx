import type { Metadata } from "next";
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";
import { PageTitle } from "@/components/page-title";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("search");
  return { title: t("title") };
}

export default function SearchPage() {
  const t = useTranslations("search");
  return (
    <>
      <PageTitle>{t("title")}</PageTitle>
      <input
        type="search"
        disabled
        placeholder={t("placeholder")}
        className="mb-4 min-h-11 w-full rounded-xl border border-border bg-surface px-4"
      />
      <p className="text-muted">{t("comingSoon")}</p>
    </>
  );
}
