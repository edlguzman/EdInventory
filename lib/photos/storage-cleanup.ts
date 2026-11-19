import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { PHOTO_BUCKET } from "./paths";

/** Every file under {userId}/ (folders are item ids), page by page. */
export async function listUserFiles(supabase: SupabaseClient, userId: string): Promise<string[]> {
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
 * Removes all of a user's photos through the Storage API (direct deletes on
 * storage.objects are blocked by Supabase). Throws if listing or removing fails.
 * Files left afterwards (e.g. uploaded meanwhile in another tab) are only logged.
 */
export async function removeUserFiles(supabase: SupabaseClient, userId: string) {
  const files = await listUserFiles(supabase, userId);
  for (let i = 0; i < files.length; i += 100) {
    const { error } = await supabase.storage.from(PHOTO_BUCKET).remove(files.slice(i, i + 100));
    if (error) throw new Error(`storage remove failed: ${error.message}`);
  }
  const leftover = await listUserFiles(supabase, userId);
  if (leftover.length) console.error("storage cleanup: files left", { count: leftover.length });
}
