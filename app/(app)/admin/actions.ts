"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getProfile } from "@/lib/auth";
import { removeUserFiles } from "@/lib/photos/storage-cleanup";
import { createServiceClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type AdminActionError = "forbidden" | "notFound" | "unknown";
export type AdminActionResult = { ok: true } | { ok: false; error: AdminActionError };

const userIdSchema = z.uuid();

/** Database errors of the admin functions → dictionary keys (admin.errors). */
function mapError(code: string | undefined): AdminActionError {
  if (code === "42501") return "forbidden";
  if (code === "P0002") return "notFound";
  return "unknown";
}

/**
 * Activate or disable an account. The database function checks again that the caller
 * is an active admin, that the target is not the caller and not another admin.
 */
export async function setUserStatus(userId: string, status: "active" | "disabled"): Promise<AdminActionResult> {
  const id = userIdSchema.safeParse(userId);
  const st = z.enum(["active", "disabled"]).safeParse(status);
  if (!id.success || !st.success) return { ok: false, error: "notFound" };
  if (!(await getProfile())?.isAdmin) return { ok: false, error: "forbidden" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_set_status", { p_user_id: id.data, p_status: st.data });
  if (error) return { ok: false, error: mapError(error.code) };

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
