"use server";

import { revalidatePath } from "next/cache";
import { aiRequestsLeft } from "@/app/(app)/items/bulk-actions";
import { getProfile, getUser } from "@/lib/auth";
import { isLang } from "@/lib/languages";
import { createClient } from "@/lib/supabase/server";
import { estimatePacks } from "@/lib/translate/records";

export type LanguageChangePreview =
  | { ok: true; records: number; requests: number; aiLeft: number | null }
  | { ok: false };

/**
 * Before changing "my language": how many records would have no text in `next` (shown in
 * English until translated) and about how many AI requests translating them takes.
 */
export async function previewLanguageChange(next: string): Promise<LanguageChangePreview> {
  if (!isLang(next)) return { ok: false };
  const user = await getUser();
  if (!user) return { ok: false };
  const supabase = await createClient();
  const [estimate, aiLeft] = await Promise.all([estimatePacks(supabase, "local", next), aiRequestsLeft()]);
  return { ok: true, ...estimate, aiLeft };
}

/**
 * Changes "my language": the interface and new records. Nothing is deleted or rewritten here;
 * records in the old language are shown in English until translated (the client starts that
 * only if the user agreed). The database lets a user update only lang / show_english of
 * their own profile.
 */
export async function setMyLanguage(next: string): Promise<{ ok: boolean }> {
  if (!isLang(next)) return { ok: false };
  const user = await getUser();
  if (!user) return { ok: false };
  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update({ lang: next }).eq("user_id", user.id).select("lang").single();
  if (error) return { ok: false };
  revalidatePath("/", "layout");
  return { ok: true };
}

/** "Show English next to it" (not for English as "my language"). */
export async function setShowEnglish(show: boolean): Promise<{ ok: boolean }> {
  const profile = await getProfile();
  if (!profile || typeof show !== "boolean" || (show && profile.lang === "en")) return { ok: false };
  const user = await getUser();
  if (!user) return { ok: false };
  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ show_english: show })
    .eq("user_id", user.id)
    .select("show_english")
    .single();
  if (error) return { ok: false };
  revalidatePath("/", "layout");
  return { ok: true };
}
