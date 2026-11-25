"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { LOCALE_COOKIE } from "@/i18n/config";
import { authErrorKey, type AuthErrorKey } from "@/lib/auth-errors";
import { notifyAdmin } from "@/lib/notify/admin-email";
import { notifyUser } from "@/lib/notify/user-email";
import { safeNext } from "@/lib/safe-next";
import { createClient } from "@/lib/supabase/server";
import {
  forgotPasswordSchema,
  loginSchema,
  resetPasswordSchema,
  signupSchema,
  type ForgotPasswordInput,
  type LoginInput,
  type ResetPasswordInput,
  type SignupInput,
} from "@/lib/validation/auth";

export type AuthActionResult = { error: AuthErrorKey } | { status: "checkEmail" | "resetSent" };

/** Origin of the current request, used to build links in Supabase emails. */
async function requestOrigin() {
  const h = await headers();
  const origin = h.get("origin");
  if (origin) return origin;
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "https";
  return `${proto}://${host}`;
}

/** The guest's language choice ends with signing in or out: "my language" inside, the browser's after. */
async function forgetGuestLanguage() {
  (await cookies()).delete(LOCALE_COOKIE);
}

export async function signIn(input: LoginInput, next?: string): Promise<AuthActionResult> {
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) return { error: "unknown" };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return { error: authErrorKey(error) };

  await forgetGuestLanguage();
  redirect(safeNext(next));
}

export async function signUp(input: SignupInput): Promise<AuthActionResult> {
  const parsed = signupSchema.safeParse(input);
  if (!parsed.success) return { error: "unknown" };

  const supabase = await createClient();
  // "My language", chosen explicitly on the sign-up screen; read once by the profile trigger,
  // which also creates the default categories in it.
  const { lang } = parsed.data;
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      emailRedirectTo: `${await requestOrigin()}/auth/confirm?next=/`,
      data: { lang },
    },
  });
  if (error) return { error: authErrorKey(error) };

  // A new account waits for approval: tell the admin and the user. With email confirmation on, Supabase
  // answers an already registered email with a fake user without identities: no email then.
  if (data.user?.identities?.length) {
    const email = parsed.data.email;
    after(() => Promise.all([notifyAdmin({ kind: "signup", email }), notifyUser({ kind: "registered", to: email, lang })]));
  }

  // Email confirmation off: Supabase returns a session right away.
  if (data.session) {
    await forgetGuestLanguage();
    redirect("/");
  }
  // Confirmation on: the user must follow the link from the email.
  return { status: "checkEmail" };
}

export async function requestPasswordReset(input: ForgotPasswordInput): Promise<AuthActionResult> {
  const parsed = forgotPasswordSchema.safeParse(input);
  if (!parsed.success) return { error: "unknown" };

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${await requestOrigin()}/auth/confirm?next=/reset-password`,
  });
  // Do not reveal whether the email is registered: only rate limits are reported.
  if (error) {
    const key = authErrorKey(error);
    if (key === "emailRateLimit" || key === "rateLimit") return { error: key };
  }
  return { status: "resetSent" };
}

export async function updatePassword(input: ResetPasswordInput): Promise<AuthActionResult> {
  const parsed = resetPasswordSchema.safeParse(input);
  if (!parsed.success) return { error: "unknown" };

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return { error: authErrorKey(error) };

  redirect("/");
}

export async function signOut() {
  const supabase = await createClient();
  // This device only: signing out on the phone must not end the session on the computer.
  await supabase.auth.signOut({ scope: "local" });
  await forgetGuestLanguage();
  redirect("/login");
}
