import "server-only";
import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { displayLang, isDataLang, type DataLang, type TextLang } from "@/lib/data-lang";
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

export async function requireUser() {
  const user = await getUser();
  if (!user) redirect("/login");
  return user;
}

export type AccountStatus = "pending" | "active" | "disabled";

/**
 * The signed-in user's profile (status and role) from public.profiles. RLS lets a user
 * read only their own row. A missing row is treated as pending (never as active).
 */
export const getProfile = cache(async (): Promise<{ status: AccountStatus; isAdmin: boolean; dataLang: DataLang } | null> => {
  const user = await getUser();
  if (!user) return null;
  const supabase = await createClient();
  const { data } = await supabase.from("profiles").select("status, role, data_lang").eq("user_id", user.id).maybeSingle();
  const status = (data?.status ?? "pending") as AccountStatus;
  const dataLang = isDataLang(data?.data_lang) ? data.data_lang : "en";
  return { status, isAdmin: status === "active" && data?.role === "admin", dataLang };
});

/** The user's data language mode (profiles.data_lang); "en" if unknown. */
export async function getDataLang(): Promise<DataLang> {
  return (await getProfile())?.dataLang ?? "en";
}

/** Language the data is shown in on the server (page titles): by mode and interface language. */
export async function getDisplayLang(): Promise<TextLang> {
  return displayLang(await getDataLang(), await getLocale());
}

/** Admin-only pages: anyone else gets a plain 404, so the page does not reveal itself. */
export async function requireAdmin() {
  const user = await requireUser();
  const profile = await getProfile();
  if (!profile?.isAdmin) notFound();
  return user;
}
