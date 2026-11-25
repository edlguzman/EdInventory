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

export type Profile = {
  status: AccountStatus;
  /** Admin rights (the owner has them too). */
  isAdmin: boolean;
  /** The one owner: plans, prices, users' plans, admins. Set only by SQL. */
  isOwner: boolean;
  lang: Lang;
  dataLang: DataLang;
};

/**
 * The signed-in user's profile (status and role) from public.profiles. RLS lets a user
 * read only their own row. A missing row is treated as pending (never as active).
 */
export const getProfile = cache(
  async (): Promise<Profile | null> => {
    const user = await getUser();
    if (!user) return null;
    const supabase = await createClient();
    const { data } = await supabase
      .from("profiles")
      .select("status, role, is_owner, lang, show_english")
      .eq("user_id", user.id)
      .maybeSingle();
    const status = (data?.status ?? "pending") as AccountStatus;
    const dataLang = dataLangOf(data?.lang, data?.show_english);
    const isAdmin = status === "active" && data?.role === "admin";
    return { status, isAdmin, isOwner: isAdmin && !!data?.is_owner, lang: dataLang.lang, dataLang };
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

/**
 * Admin pages ("owner": the owner's only). Anyone else gets a plain 404, so the page does not
 * reveal itself; the database functions refuse as well.
 */
export async function requireAdmin(level: "admin" | "owner" = "admin") {
  const user = await requireUser();
  const profile = await getProfile();
  if (!profile?.isAdmin || (level === "owner" && !profile.isOwner)) notFound();
  return { user, isOwner: profile.isOwner };
}

/** The same check for admin server actions. */
export async function mayAdmin(level: "admin" | "owner" = "admin"): Promise<boolean> {
  const profile = await getProfile();
  return !!profile?.isAdmin && (level === "admin" || profile.isOwner);
}
