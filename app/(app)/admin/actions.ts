"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { getProfile } from "@/lib/auth";
import { isDataLang } from "@/lib/data-lang";
import { notifyUser } from "@/lib/notify/user-email";
import { removeUserFiles } from "@/lib/photos/storage-cleanup";
import { createServiceClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type AdminActionError = "forbidden" | "notFound" | "invalid" | "unknown";
export type AdminActionResult = { ok: true } | { ok: false; error: AdminActionError };

const userIdSchema = z.uuid();

/** Database errors of the admin functions → dictionary keys (admin.errors). */
function mapError(code: string | undefined): AdminActionError {
  if (code === "42501") return "forbidden";
  if (code === "P0002") return "notFound";
  if (code === "22023" || code === "23514") return "invalid";
  return "unknown";
}

/**
 * Activate or disable an account. The database function checks again that the caller
 * is an active admin, that the target is not the caller and not another admin, and returns
 * the user's email, data language and previous status for the notification email.
 */
export async function setUserStatus(userId: string, status: "active" | "disabled"): Promise<AdminActionResult> {
  const id = userIdSchema.safeParse(userId);
  const st = z.enum(["active", "disabled"]).safeParse(status);
  if (!id.success || !st.success) return { ok: false, error: "notFound" };
  if (!(await getProfile())?.isAdmin) return { ok: false, error: "forbidden" };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_set_status", { p_user_id: id.data, p_status: st.data });
  if (error) return { ok: false, error: mapError(error.code) };

  // Tell the user, only when the status really changed (in the background; a mail error
  // never affects the action). Skipped until MAIL_FROM is configured.
  const contact = data?.[0];
  if (contact && contact.old_status !== st.data) {
    const kind = st.data === "disabled" ? "disabled" : contact.old_status === "pending" ? "approved" : "reactivated";
    const dataLang = isDataLang(contact.data_lang) ? contact.data_lang : "en";
    after(() => notifyUser({ kind, to: contact.email, dataLang }));
  }

  revalidatePath("/", "layout"); // the pending badge in the bottom navigation
  return { ok: true };
}

/**
 * Delete an account with all its data and photos.
 * 1) admin_check_delete() with the admin's own session: the caller is an active admin,
 *    the target exists, is not the caller and not an admin. Nothing happens otherwise.
 * 2) Only then the service role client (server only) removes the target's Storage files
 *    and the auth user; every table cascades.
 */
export async function deleteUser(userId: string): Promise<AdminActionResult> {
  const id = userIdSchema.safeParse(userId);
  if (!id.success) return { ok: false, error: "notFound" };
  if (!(await getProfile())?.isAdmin) return { ok: false, error: "forbidden" };

  const supabase = await createClient();
  const { error: checkError } = await supabase.rpc("admin_check_delete", { p_user_id: id.data });
  if (checkError) return { ok: false, error: mapError(checkError.code) };

  try {
    const service = createServiceClient();
    await removeUserFiles(service, id.data);
    const { error } = await service.auth.admin.deleteUser(id.data);
    if (error) throw new Error(`auth delete failed: ${error.status ?? "unknown"}`);
  } catch (error) {
    console.error("admin delete user failed", { message: error instanceof Error ? error.message : "unknown" });
    return { ok: false, error: "unknown" };
  }

  revalidatePath("/", "layout");
  return { ok: true };
}

const planCode = z.string().regex(/^[a-z0-9_]{1,32}$/);

/**
 * Assign a manual plan (null = remove it: the user falls back to a subscription or free),
 * optionally until a date (ISO; after it the user is back on free by themselves).
 * admin_set_plan() checks again: caller is an active admin, target is not the caller or an admin.
 */
export async function setUserPlan(userId: string, plan: string | null, until: string | null): Promise<AdminActionResult> {
  const id = userIdSchema.safeParse(userId);
  const code = planCode.nullable().safeParse(plan);
  const end = z.iso.datetime({ offset: true }).nullable().safeParse(until);
  if (!id.success) return { ok: false, error: "notFound" };
  if (!code.success || !end.success) return { ok: false, error: "invalid" };
  if (!(await getProfile())?.isAdmin) return { ok: false, error: "forbidden" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_set_plan", {
    p_user_id: id.data,
    p_plan: code.data as string,
    p_until: (code.data ? end.data : null) as string,
  });
  if (error) return { ok: false, error: mapError(error.code) };
  revalidatePath("/admin");
  return { ok: true };
}

const planSchema = z.object({
  code: planCode,
  name_ru: z.string().trim().min(1).max(50),
  name_en: z.string().trim().min(1).max(50),
  item_limit: z.number().int().min(0).max(1_000_000).nullable(),
  ai_daily_limit: z.number().int().min(0).max(100_000).nullable(),
  sort_order: z.number().int().min(-1000).max(1000),
});

/** Edit a plan's names and limits (null limit = none / the default AI limit). Takes effect at once. */
export async function updatePlan(input: z.input<typeof planSchema>): Promise<AdminActionResult> {
  const v = planSchema.safeParse(input);
  if (!v.success) return { ok: false, error: "invalid" };
  if (!(await getProfile())?.isAdmin) return { ok: false, error: "forbidden" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_update_plan", {
    p_code: v.data.code,
    p_name_ru: v.data.name_ru,
    p_name_en: v.data.name_en,
    p_item_limit: v.data.item_limit as number,
    p_ai_daily_limit: v.data.ai_daily_limit as number,
    p_sort_order: v.data.sort_order,
  });
  if (error) return { ok: false, error: mapError(error.code) };
  revalidatePath("/", "layout"); // limits are shown everywhere
  return { ok: true };
}
