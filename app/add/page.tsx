import type { Metadata } from "next";
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";
import { PageTitle } from "@/components/page-title";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("add");
  return { title: t("title") };
}

export default function AddPage() {
  const t = useTranslations("add");
  return (
    <>
      <PageTitle>{t("title")}</PageTitle>
      <p className="text-muted">{t("comingSoon")}</p>
    </>
  );
}
