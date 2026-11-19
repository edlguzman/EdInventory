import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { ItemForm } from "@/components/items/item-form";
import { PageTitle } from "@/components/page-title";
import { requireUser } from "@/lib/auth";
import { getCategories, getItem } from "@/lib/items/data";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("items");
  return { title: t("editTitle") };
}

export default async function EditItemPage({ params }: PageProps<"/items/[id]/edit">) {
  const { id } = await params;
  const [user, item, categories, t] = await Promise.all([
    requireUser(),
    z.uuid().safeParse(id).success ? getItem(id) : null,
    getCategories(),
    getTranslations("items"),
  ]);
  if (!item) notFound();
  return (
    <>
      <PageTitle>{t("editTitle")}</PageTitle>
      <ItemForm mode="edit" item={item} userId={user.id} categories={categories} />
    </>
  );
}
