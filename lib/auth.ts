import "server-only";
import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { dataLangOf, displaySlot, type DataLang, type Slot } from "@/lib/data-lang";
import type { Lang } from "@/lib/languages";
import { createClient } from "@/lib/supabase/server";

/**
 * Current user, verified with the Supabase Auth server (not just the cookie).
 * Cached per request, so several components can call it.
 */
export const getUser = cache(async () => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error) return null;
  return data.user;
});

/**
 * No valid user: clear this device's session first (/auth/signout), then sign in.
 * Redirecting straight to /login would loop when the cookie still holds a token that is
 * signed correctly but revoked: the proxy (signature check only) would send it back here.
 */
export async function requireUser() {
  const user = await getUser();
  if (!user) redirect("/auth/signout");
  return user;
}

export type AccountStatus = "pending" | "active" | "disabled";

/**
 * The signed-in user's profile (status and role) from public.profiles. RLS lets a user
 * read only their own row. A missing row is treated as pending (never as active).
 */
export const getProfile = cache(
  async (): Promise<{ status: AccountStatus; isAdmin: boolean; lang: Lang; dataLang: DataLang } | null> => {
    const user = await getUser();
    if (!user) return null;
    const supabase = await createClient();
    const { data } = await supabase
      .from("profiles")
      .select("status, role, lang, show_english")
      .eq("user_id", user.id)
      .maybeSingle();
    const status = (data?.status ?? "pending") as AccountStatus;
    const dataLang = dataLangOf(data?.lang, data?.show_english);
    return { status, isAdmin: status === "active" && data?.role === "admin", lang: dataLang.lang, dataLang };
  },
);

/** The user's language and record mode (profiles.lang + show_english); English if unknown. */
export async function getDataLang(): Promise<DataLang> {
  return (await getProfile())?.dataLang ?? dataLangOf("en", false);
}

/** The text slot shown on the server (page titles). */
export async function getDisplaySlot(): Promise<Slot> {
  return displaySlot((await getDataLang()).mode);
}

/** Admin-only pages: anyone else gets a plain 404, so the page does not reveal itself. */
export async function requireAdmin() {
  const user = await requireUser();
  const profile = await getProfile();
  if (!profile?.isAdmin) notFound();
  return user;
}
