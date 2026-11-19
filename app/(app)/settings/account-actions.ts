"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { getUser } from "@/lib/auth";
import { PHOTO_BUCKET } from "@/lib/photos/paths";
import { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export type DeleteAccountError = "wrongPassword" | "confirmMismatch" | "rateLimit" | "unauthorized" | "unknown";

const CONFIRM_WORDS = ["УДАЛИТЬ", "DELETE"];

/** Every file under {userId}/ (folders are item ids), page by page. */
async function listAllFiles(supabase: Supabase, userId: string): Promise<string[]> {
  const storage = supabase.storage.from(PHOTO_BUCKET);
  const page = async (prefix: string) => {
    const out: { name: string; isFolder: boolean }[] = [];
    for (let offset = 0; ; offset += 100) {
      const { data, error } = await storage.list(prefix, { limit: 100, offset });
      if (error) throw new Error(`storage list failed: ${error.message}`);
      out.push(...data.map((e) => ({ name: e.name, isFolder: e.id === null })));
      if (data.length < 100) return out;
    }
  };
  const files: string[] = [];
  for (const entry of await page(userId)) {
    if (entry.isFolder) {
      for (const f of await page(`${userId}/${entry.name}`)) if (!f.isFolder) files.push(`${userId}/${entry.name}/${f.name}`);
    } else {
      files.push(`${userId}/${entry.name}`);
    }
  }
  return files;
}

/**
 * Deletes the account with all data and photos.
 * 1) the password is checked again; 2) all files go through the Storage API (direct
 * deletes on storage.objects are blocked by Supabase); 3) delete_my_account() removes
 * the auth user, and every table cascades.
 */
export async function deleteAccount(input: { password: string; confirm: string }): Promise<{ error: DeleteAccountError }> {
  const parsed = z.object({ password: z.string().min(1).max(200), confirm: z.string().max(20) }).safeParse(input);
  if (!parsed.success) return { error: "wrongPassword" };
  if (!CONFIRM_WORDS.includes(parsed.data.confirm.trim().toUpperCase())) return { error: "confirmMismatch" };

  const user = await getUser();
  if (!user?.email) return { error: "unauthorized" };
  const supabase = await createClient();

  const { error: authError } = await supabase.auth.signInWithPassword({ email: user.email, password: parsed.data.password });
  if (authError) return { error: authError.status === 429 ? "rateLimit" : "wrongPassword" };

  try {
    const files = await listAllFiles(supabase, user.id);
    for (let i = 0; i < files.length; i += 100) {
      const { error } = await supabase.storage.from(PHOTO_BUCKET).remove(files.slice(i, i + 100));
      if (error) throw new Error(`storage remove failed: ${error.message}`);
    }
    // Anything left (e.g. a file uploaded in another tab meanwhile) must not block deletion,
    // but it is worth knowing about.
    const leftover = await listAllFiles(supabase, user.id);
    if (leftover.length) console.error("account deletion: files left after cleanup", { count: leftover.length });
  } catch (error) {
    console.error("account deletion: storage cleanup failed", { message: error instanceof Error ? error.message : "unknown" });
    return { error: "unknown" };
  }

  const { error: rpcError } = await supabase.rpc("delete_my_account");
  if (rpcError) {
    console.error("account deletion: rpc failed", { code: rpcError.code });
    return { error: "unknown" };
  }

  // The user no longer exists: drop the session cookies locally (the server call may fail).
  await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
  redirect("/login?deleted=1");
}
