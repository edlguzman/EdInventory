import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";
import { USERS_PAGE_SIZE, type UserFilters } from "./filters";

export type AdminUser = Database["public"]["Functions"]["admin_list_users_v4"]["Returns"][number];
/** One kind of AI requests over 30 days (cost null: no request of it has tokens and a price). */
export type AiKindUsage = { kind: string; n: number; cost: number | null };
export type UsageOverview = Database["public"]["Functions"]["admin_usage_overview"]["Returns"][number];
export type AiPrice = { model: string; valid_from: string; input: number; audio: number | null; output: number };
export type UsageSettings = { storage_limit_bytes: number; prices: AiPrice[]; models: string[] };
export type PlanRow = Database["public"]["Tables"]["plans"]["Row"];
/** A plan with its users: on it right now, and linked to it (manual or subscription, even expired). */
export type PlanWithStats = PlanRow & { users_now: number; users_linked: number };

/**
 * Accounts awaiting approval, for the badge on "Settings" and the admin link.
 * The database function itself refuses non-admins; call it only for the admin.
 */
export const getPendingCount = cache(async () => {
  const supabase = await createClient();
  const { data } = await supabase.rpc("admin_pending_count");
  return data ?? 0;
});

/** Numbers for the admin home screen. Admin only, checked in the database. */
export async function getOverview() {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_overview");
  if (error) throw new Error(`admin_overview failed: ${error.code}`);
  const row = data?.[0];
  return { users: row?.users_count ?? 0, pending: row?.pending_count ?? 0, plans: row?.plans_count ?? 0 };
}

/** Storage and AI totals for the admin home screen. Admin only, checked in the database. */
export async function getUsageOverview(): Promise<UsageOverview> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_usage_overview");
  if (error || !data?.[0]) throw new Error(`admin_usage_overview failed: ${error?.code ?? "empty"}`);
  return data[0];
}

/** Prices and the storage limit; the configured model is listed even before its first request. */
export async function getUsageSettings(): Promise<UsageSettings> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_usage_settings");
  if (error) throw new Error(`admin_usage_settings failed: ${error.code}`);
  const s = data as unknown as UsageSettings;
  const current = process.env.GEMINI_MODEL;
  return { ...s, models: [...new Set([...(current ? [current] : []), ...s.models])] };
}

/** One page of accounts with numbers only (no items, places or photos). Admin only, checked in the database. */
export async function listUsersPage(f: UserFilters): Promise<{ users: AdminUser[]; total: number }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_list_users_v4", {
    p_search: (f.q || null) as string,
    p_status: f.status as string,
    p_plan: f.plan as string,
    p_sort: f.sort,
    p_limit: USERS_PAGE_SIZE,
    p_offset: (f.page - 1) * USERS_PAGE_SIZE,
  });
  if (error) throw new Error(`admin_list_users_v4 failed: ${error.code}`);
  const users = data ?? [];
  return { users, total: users[0]?.total ?? 0 };
}

/** All plans in their order (readable by every active user). */
export async function listPlans(): Promise<PlanRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("plans").select("*").order("sort_order").order("code");
  if (error) throw new Error(`plans failed: ${error.code}`);
  return data ?? [];
}

/** Plans with their user counts (admin only, checked in the database). */
export async function listPlansWithStats(): Promise<PlanWithStats[]> {
  const supabase = await createClient();
  const [plans, { data, error }] = await Promise.all([listPlans(), supabase.rpc("admin_plan_stats")]);
  if (error) throw new Error(`admin_plan_stats failed: ${error.code}`);
  const stats = new Map((data ?? []).map((s) => [s.code, s]));
  return plans.map((p) => ({ ...p, users_now: stats.get(p.code)?.users_now ?? 0, users_linked: stats.get(p.code)?.users_linked ?? 0 }));
}
