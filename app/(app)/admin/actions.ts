"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { mayAdmin } from "@/lib/auth";
import { notifyUser } from "@/lib/notify/user-email";
import { removeUserFiles } from "@/lib/photos/storage-cleanup";
import { createServiceClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type AdminActionError = "forbidden" | "notFound" | "invalid" | "exists" | "inUse" | "unknown";
export type AdminActionResult = { ok: true } | { ok: false; error: AdminActionError };

const userIdSchema = z.uuid();

/** Database errors of the admin functions → dictionary keys (admin.errors). */
function mapError(code: string | undefined): AdminActionError {
  if (code === "42501") return "forbidden";
  if (code === "P0002") return "notFound";
  if (code === "22023" || code === "23514") return "invalid";
  if (code === "23505") return "exists";
  if (code === "P0011" || code === "23503") return "inUse";
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
  if (!(await mayAdmin())) return { ok: false, error: "forbidden" };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_set_status_v3", { p_user_id: id.data, p_status: st.data });
  if (error) return { ok: false, error: mapError(error.code) };

  // Tell the user, only when the status really changed (in the background; a mail error
  // never affects the action). Skipped until MAIL_FROM is configured.
  const contact = data?.[0];
  if (contact && contact.old_status !== st.data) {
    const kind = st.data === "disabled" ? "disabled" : contact.old_status === "pending" ? "approved" : "reactivated";
    after(() => notifyUser({ kind, to: contact.email, lang: contact.lang }));
  }

  revalidatePath("/", "layout"); // the pending badge in the bottom navigation
  return { ok: true };
}

/**
 * Delete an account with all its data and photos.
 * 1) admin_check_delete_v2() with the admin's own session: the caller is an active admin,
 *    the target exists, is not the caller and not an admin. Nothing happens otherwise.
 * 2) Only then the service role client (server only) removes the target's Storage files
 *    and the auth user; every table cascades.
 */
export async function deleteUser(userId: string): Promise<AdminActionResult> {
  const id = userIdSchema.safeParse(userId);
  if (!id.success) return { ok: false, error: "notFound" };
  if (!(await mayAdmin())) return { ok: false, error: "forbidden" };

  const supabase = await createClient();
  const { error: checkError } = await supabase.rpc("admin_check_delete_v2", { p_user_id: id.data });
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

/**
 * Make an active user an admin, or an admin a user again. The owner only; admin_set_role()
 * checks again and never touches the owner (that role is set only by SQL).
 */
export async function setUserRole(userId: string, role: "user" | "admin"): Promise<AdminActionResult> {
  const id = userIdSchema.safeParse(userId);
  const r = z.enum(["user", "admin"]).safeParse(role);
  if (!id.success || !r.success) return { ok: false, error: "notFound" };
  if (!(await mayAdmin("owner"))) return { ok: false, error: "forbidden" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_set_role", { p_user_id: id.data, p_role: r.data });
  if (error) return { ok: false, error: mapError(error.code) };
  revalidatePath("/admin", "layout");
  return { ok: true };
}

const planCode = z.string().regex(/^[a-z0-9_]{1,32}$/);

/**
 * Assign a manual plan (null = remove it: the user falls back to a subscription or free),
 * optionally until a date (ISO; after it the user is back on free by themselves).
 * The owner only (admin_set_plan_v2() checks again); admins have a plan too, the owner does not need one.
 */
export async function setUserPlan(userId: string, plan: string | null, until: string | null): Promise<AdminActionResult> {
  const id = userIdSchema.safeParse(userId);
  const code = planCode.nullable().safeParse(plan);
  const end = z.iso.datetime({ offset: true }).nullable().safeParse(until);
  if (!id.success) return { ok: false, error: "notFound" };
  if (!code.success || !end.success) return { ok: false, error: "invalid" };
  if (!(await mayAdmin("owner"))) return { ok: false, error: "forbidden" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_set_plan_v2", {
    p_user_id: id.data,
    p_plan: code.data as string,
    p_until: (code.data ? end.data : null) as string,
  });
  if (error) return { ok: false, error: mapError(error.code) };
  revalidatePath("/admin", "layout"); // the user list and the plan counts
  return { ok: true };
}

const planSchema = z.object({
  code: planCode,
  /** Names by language code; English required, empty ones dropped. */
  names: z
    .record(z.string().regex(/^[a-z]{2,3}$/), z.string().trim().max(50))
    .transform((n) => Object.fromEntries(Object.entries(n).filter(([, v]) => v.length > 0)))
    .refine((n) => !!n.en, { error: "invalid" }),
  item_limit: z.number().int().min(0).max(1_000_000).nullable(),
  ai_daily_limit: z.number().int().min(0).max(100_000).nullable(),
  sort_order: z.number().int().min(-1000).max(1000),
});

/** Edit a plan's names and limits (null limit = none / the default AI limit). Takes effect at once. */
export async function updatePlan(input: z.input<typeof planSchema>): Promise<AdminActionResult> {
  const v = planSchema.safeParse(input);
  if (!v.success) return { ok: false, error: "invalid" };
  if (!(await mayAdmin("owner"))) return { ok: false, error: "forbidden" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_update_plan_v3", {
    p_code: v.data.code,
    p_names: v.data.names,
    p_item_limit: v.data.item_limit as number,
    p_ai_daily_limit: v.data.ai_daily_limit as number,
    p_sort_order: v.data.sort_order,
  });
  if (error) return { ok: false, error: mapError(error.code) };
  revalidatePath("/", "layout"); // limits are shown everywhere
  return { ok: true };
}

const newPlanSchema = planSchema.omit({ sort_order: true });

/** Add a plan (placed last). The code is permanent: latin letters, digits, "_". */
export async function createPlan(input: z.input<typeof newPlanSchema>): Promise<AdminActionResult> {
  const v = newPlanSchema.safeParse(input);
  if (!v.success) return { ok: false, error: "invalid" };
  if (!(await mayAdmin("owner"))) return { ok: false, error: "forbidden" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_create_plan_v3", {
    p_code: v.data.code,
    p_names: v.data.names,
    p_item_limit: v.data.item_limit as number,
    p_ai_daily_limit: v.data.ai_daily_limit as number,
  });
  if (error) return { ok: false, error: mapError(error.code) };
  revalidatePath("/", "layout");
  return { ok: true };
}

/** Delete a plan nobody is linked to (the database refuses "free" and plans in use). */
export async function deletePlan(code: string): Promise<AdminActionResult> {
  const c = planCode.safeParse(code);
  if (!c.success) return { ok: false, error: "invalid" };
  if (!(await mayAdmin("owner"))) return { ok: false, error: "forbidden" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_delete_plan_v2", { p_code: c.data });
  if (error) return { ok: false, error: mapError(error.code) };
  revalidatePath("/", "layout");
  return { ok: true };
}

/** New order of all plans (every code once). */
export async function reorderPlans(codes: string[]): Promise<AdminActionResult> {
  const c = z.array(planCode).min(1).max(100).safeParse(codes);
  if (!c.success) return { ok: false, error: "invalid" };
  if (!(await mayAdmin("owner"))) return { ok: false, error: "forbidden" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_reorder_plans_v2", { p_codes: c.data });
  if (error) return { ok: false, error: mapError(error.code) };
  revalidatePath("/", "layout");
  return { ok: true };
}

const modelName = z.string().trim().regex(/^[a-z0-9][a-z0-9._-]{0,99}$/);
const usd = z.number().min(0).max(10_000);
const priceSchema = z.object({ model: modelName, valid_from: z.iso.date(), input: usd, audio: usd.nullable(), output: usd });

/** USD per million tokens of a model from a date on (an earlier price keeps counting for earlier requests). */
export async function setAiPrice(input: z.input<typeof priceSchema>): Promise<AdminActionResult> {
  const v = priceSchema.safeParse(input);
  if (!v.success) return { ok: false, error: "invalid" };
  if (!(await mayAdmin("owner"))) return { ok: false, error: "forbidden" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_set_ai_price_v2", {
    p_model: v.data.model,
    p_valid_from: v.data.valid_from,
    p_input: v.data.input,
    p_audio: v.data.audio as number,
    p_output: v.data.output,
  });
  if (error) return { ok: false, error: mapError(error.code) };
  revalidatePath("/admin", "layout");
  return { ok: true };
}

/** Remove one price (requests since that date count at the price before it, if there is one). */
export async function deleteAiPrice(model: string, validFrom: string): Promise<AdminActionResult> {
  const m = modelName.safeParse(model);
  const d = z.iso.date().safeParse(validFrom);
  if (!m.success || !d.success) return { ok: false, error: "invalid" };
  if (!(await mayAdmin("owner"))) return { ok: false, error: "forbidden" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_delete_ai_price_v2", { p_model: m.data, p_valid_from: d.data });
  if (error) return { ok: false, error: mapError(error.code) };
  revalidatePath("/admin", "layout");
  return { ok: true };
}

/** The storage limit shown on the admin home screen, in GB (1024³ bytes). Only a number to compare with. */
export async function setStorageLimit(gb: number): Promise<AdminActionResult> {
  const v = z.number().min(0.01).max(1000).safeParse(gb);
  if (!v.success) return { ok: false, error: "invalid" };
  if (!(await mayAdmin("owner"))) return { ok: false, error: "forbidden" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_set_storage_limit_v2", { p_bytes: Math.round(v.data * 1024 ** 3) });
  if (error) return { ok: false, error: mapError(error.code) };
  revalidatePath("/admin", "layout");
  return { ok: true };
}
