import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";

export type AdminUser = Database["public"]["Functions"]["admin_list_users_v2"]["Returns"][number];
export type PlanRow = Database["public"]["Tables"]["plans"]["Row"];

/**
 * Accounts awaiting approval, for the badge on "Settings" and the admin link.
 * The database function itself refuses non-admins; call it only for the admin.
 */
export const getPendingCount = cache(async () => {
  const supabase = await createClient();
  const { data } = await supabase.rpc("admin_pending_count");
  return data ?? 0;
});

/** All accounts with numbers only (no items, places or photos). Admin only, checked in the database. */
export async function listUsers(): Promise<AdminUser[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_list_users_v2");
  if (error) throw new Error(`admin_list_users_v2 failed: ${error.code}`);
  return data ?? [];
}

/** All plans in their order (admins edit them in /admin). */
export async function listPlans(): Promise<PlanRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("plans").select("*").order("sort_order").order("code");
  if (error) throw new Error(`plans failed: ${error.code}`);
  return data ?? [];
}
