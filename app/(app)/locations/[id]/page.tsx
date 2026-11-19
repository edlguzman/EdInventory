import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getLocale } from "next-intl/server";
import { z } from "zod";
import { LocationDetail } from "@/components/locations/location-detail";
import { createClient } from "@/lib/supabase/server";

async function findLocation(id: string) {
  if (!z.uuid().safeParse(id).success) return null;
  const supabase = await createClient();
  const { data } = await supabase.from("locations").select("id, name_ru, name_en").eq("id", id).maybeSingle();
  return data;
}

export async function generateMetadata({ params }: PageProps<"/locations/[id]">): Promise<Metadata> {
  const loc = await findLocation((await params).id);
  if (!loc) return {};
  return { title: (await getLocale()) === "en" ? loc.name_en : loc.name_ru };
}

export default async function LocationPage({ params }: PageProps<"/locations/[id]">) {
  const { id } = await params;
  // RLS: another user's place looks the same as a missing one.
  if (!(await findLocation(id))) notFound();
  return <LocationDetail id={id} />;
}
