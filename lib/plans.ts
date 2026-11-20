import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

/** The signed-in user's effective plan and usage (SQL my_plan(), computed in the database). */
export type MyPlan = {
  code: string;
  nameRu: string;
  nameEn: string;
  itemLimit: number | null;
  aiDailyLimit: number | null;
  source: "manual" | "subscription" | "default";
  until: string | null;
  itemsCount: number;
  aiUsed24h: number;
  isAdmin: boolean;
  /** Items reached the limit: new items and all AI are blocked (admins: never). */
  atItemLimit: boolean;
};

export const getMyPlan = cache(async (): Promise<MyPlan | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("my_plan");
  const row = data?.[0];
  if (error || !row) return null;
  const itemLimit = row.item_limit ?? null;
  return {
    code: row.code,
    nameRu: row.name_ru,
    nameEn: row.name_en,
    itemLimit,
    aiDailyLimit: row.ai_daily_limit ?? null,
    source: (row.source as MyPlan["source"]) ?? "default",
    until: row.until ?? null,
    itemsCount: Number(row.items_count ?? 0),
    aiUsed24h: Number(row.ai_used_24h ?? 0),
    isAdmin: !!row.is_admin,
    atItemLimit: !row.is_admin && itemLimit !== null && Number(row.items_count ?? 0) >= itemLimit,
  };
});
