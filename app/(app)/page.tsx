import { useTranslations } from "next-intl";
import { PageTitle } from "@/components/page-title";

export default function ItemsPage() {
  const t = useTranslations("items");
  return (
    <>
      <PageTitle>{t("title")}</PageTitle>
      <p className="rounded-2xl border border-dashed border-border p-6 text-center text-muted">{t("empty")}</p>
    </>
  );
}
