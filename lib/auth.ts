import "server-only";
import { cache } from "react";
import { notFound, redirect } from "next/navigation";
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
export const getProfile = cache(async (): Promise<{ status: AccountStatus; isAdmin: boolean } | null> => {
  const user = await getUser();
  if (!user) return null;
  const supabase = await createClient();
  const { data } = await supabase.from("profiles").select("status, role").eq("user_id", user.id).maybeSingle();
  const status = (data?.status ?? "pending") as AccountStatus;
  return { status, isAdmin: status === "active" && data?.role === "admin" };
});

/** Admin-only pages: anyone else gets a plain 404, so the page does not reveal itself. */
export async function requireAdmin() {
  const user = await requireUser();
  const profile = await getProfile();
  if (!profile?.isAdmin) notFound();
  return user;
}
