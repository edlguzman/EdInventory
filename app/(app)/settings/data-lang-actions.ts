"use server";

import { revalidatePath } from "next/cache";
import { getUser } from "@/lib/auth";
import { isDataLang, promptLangs, type TextLang } from "@/lib/data-lang";
import { createClient } from "@/lib/supabase/server";
import { countMissing } from "@/lib/translate/records";

export type SetDataLangResult = { ok: true; missing: number; langs: TextLang[] } | { ok: false };

/**
 * Switches the data language mode. Instant: nothing is deleted or rewritten, the other
 * language is only hidden or shown. Returns how many records lack text in the languages
 * the new mode shows, so the client can offer to translate them.
 * The database lets a user update only this column of their own profile.
 */
export async function setDataLang(mode: string): Promise<SetDataLangResult> {
  if (!isDataLang(mode)) return { ok: false };
  const user = await getUser();
  if (!user) return { ok: false };

  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update({ data_lang: mode }).eq("user_id", user.id).select("data_lang").single();
  if (error) return { ok: false };

  const langs = promptLangs(mode);
  const missing = await countMissing(supabase, langs);
  revalidatePath("/", "layout");
  return { ok: true, missing, langs };
}
