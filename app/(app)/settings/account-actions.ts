"use server";

import { redirect } from "next/navigation";
import { after } from "next/server";
import { z } from "zod";
import { getProfile, getUser } from "@/lib/auth";
import { notifyAdmin } from "@/lib/notify/admin-email";
import { removeUserFiles } from "@/lib/photos/storage-cleanup";
import { checkPassword } from "@/lib/supabase/password-check";
import { createClient } from "@/lib/supabase/server";

export type DeleteAccountError = "wrongPassword" | "confirmMismatch" | "rateLimit" | "unauthorized" | "owner" | "unknown";

const CONFIRM_WORDS = ["УДАЛИТЬ", "DELETE", "ELIMINAR"];

/**
 * Deletes the account with all data and photos.
 * 1) the password is checked again, apart from this session (a new sign-in would lose the code
 * of the second step); the owner cannot delete their account (the database refuses too); 2) all files go through the Storage API (direct
 * deletes on storage.objects are blocked by Supabase); 3) delete_my_account() removes
 * the auth user, and every table cascades.
 */
export async function deleteAccount(input: { password: string; confirm: string }): Promise<{ error: DeleteAccountError }> {
  const parsed = z.object({ password: z.string().min(1).max(200), confirm: z.string().max(20) }).safeParse(input);
  if (!parsed.success) return { error: "wrongPassword" };
  if (!CONFIRM_WORDS.includes(parsed.data.confirm.trim().toUpperCase())) return { error: "confirmMismatch" };

  const user = await getUser();
  const profile = await getProfile();
  if (!user?.email || !profile || profile.needsCode) return { error: "unauthorized" };
  if (profile.isOwner) return { error: "owner" };

  const check = await checkPassword(user.email, parsed.data.password);
  if (check !== "ok") return { error: check };
  const supabase = await createClient();

  try {
    await removeUserFiles(supabase, user.id);
  } catch (error) {
    console.error("account deletion: storage cleanup failed", { message: error instanceof Error ? error.message : "unknown" });
    return { error: "unknown" };
  }

  const { error: rpcError } = await supabase.rpc("delete_my_account");
  if (rpcError) {
    console.error("account deletion: rpc failed", { code: rpcError.code });
    return { error: "unknown" };
  }

  const email = user.email;
  after(() => notifyAdmin({ kind: "deleted", email }));

  // The user no longer exists: drop the session cookies locally (the server call may fail).
  await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
  redirect("/login?deleted=1");
}
