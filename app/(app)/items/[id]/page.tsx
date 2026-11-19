import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getLocale } from "next-intl/server";
import { z } from "zod";
import { ItemView } from "@/components/items/item-view";
import { getCategories, getItem } from "@/lib/items/data";
import { pickText } from "@/lib/items/types";

async function load(id: string) {
  return z.uuid().safeParse(id).success ? getItem(id) : null;
}

export async function generateMetadata({ params }: PageProps<"/items/[id]">): Promise<Metadata> {
  const item = await load((await params).id);
  return item ? { title: pickText(item.nameRu, item.nameEn, await getLocale()) } : {};
}

export default async function ItemPage({ params }: PageProps<"/items/[id]">) {
  const [item, categories] = await Promise.all([load((await params).id), getCategories()]);
  // RLS: another user's item looks the same as a missing one.
  if (!item) notFound();
  return <ItemView item={item} categories={categories} />;
}
