import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { safeNext } from "@/lib/safe-next";
import { createClient } from "@/lib/supabase/server";

const OTP_TYPES: EmailOtpType[] = ["signup", "invite", "magiclink", "recovery", "email_change", "email"];

/**
 * Handles links from Supabase emails. Supports both formats:
 * - `?token_hash=...&type=...` — custom email templates (once our own SMTP is connected);
 * - `?code=...` — default templates (PKCE). Works only in the browser where the flow started.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");
  const code = searchParams.get("code");
  const fallbackNext = type === "recovery" ? "/reset-password" : "/";
  const next = safeNext(searchParams.get("next"), fallbackNext);

  const supabase = await createClient();
  let ok = false;

  if (tokenHash && type && (OTP_TYPES as string[]).includes(type)) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: type as EmailOtpType });
    ok = !error;
  } else if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    ok = !error;
  }

  return NextResponse.redirect(new URL(ok ? next : "/login?error=link", origin));
}
