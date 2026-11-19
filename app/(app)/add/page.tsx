import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ItemForm } from "@/components/items/item-form";
import { PageTitle } from "@/components/page-title";
import { requireUser } from "@/lib/auth";
import { getCategories } from "@/lib/items/data";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("items");
  return { title: t("addTitle") };
}

export default async function AddPage() {
  const [user, categories, t] = await Promise.all([requireUser(), getCategories(), getTranslations("items")]);
  return (
    <>
      <PageTitle>{t("addTitle")}</PageTitle>
      <ItemForm mode="create" userId={user.id} categories={categories} />
    </>
  );
}
