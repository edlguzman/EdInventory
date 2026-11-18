import type { Metadata } from "next";
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";
import { PageTitle } from "@/components/page-title";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("locations");
  return { title: t("title") };
}

export default function LocationsPage() {
  const t = useTranslations("locations");
  return (
    <>
      <PageTitle>{t("title")}</PageTitle>
      <p className="text-muted">{t("comingSoon")}</p>
    </>
  );
}
