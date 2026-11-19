import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Clears a dead session on this device, then opens the sign-in page.
 *
 * The proxy checks the session only by the token signature (fast, no network), while pages
 * check it with the Auth server. When a session is revoked elsewhere ("Sign out" on all
 * devices, password change, account removed), the token still looks valid for up to an hour:
 * the page would send the user to /login and the proxy straight back to /, endlessly.
 * requireUser() sends such a user here instead; removing the cookies breaks the loop.
 * Only this device's cookies are touched (scope "local"); nothing else is revoked.
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);

  // signOut may fail for an already revoked session; remove the auth cookies regardless.
  const store = await cookies();
  for (const { name } of store.getAll()) if (name.startsWith("sb-")) store.delete(name);

  const response = NextResponse.redirect(new URL("/login", request.nextUrl.origin));
  response.headers.set("Cache-Control", "no-store");
  return response;
}
