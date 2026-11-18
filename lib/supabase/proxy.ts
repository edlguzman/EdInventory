import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { supabaseEnv } from "./env";

/** Pages for signed-out users only: a signed-in user is sent home. */
const GUEST_ONLY = ["/login", "/signup", "/forgot-password"];
/** Open to everyone: the email link handler. */
const PUBLIC = ["/auth"];

function matches(pathname: string, paths: string[]) {
  return paths.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/**
 * Refreshes the Supabase session cookies and applies optimistic route protection.
 * Real authorization happens on the server (getUser) and in the database (RLS).
 */
export async function updateSession(request: NextRequest) {
  const { url, anonKey } = supabaseEnv();
  let response = NextResponse.next({ request });
  let setCookies: { name: string; value: string; options: object }[] = [];
  let noCacheHeaders: Record<string, string> = {};

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        setCookies = cookiesToSet;
        noCacheHeaders = { ...noCacheHeaders, ...headers };
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        Object.entries(noCacheHeaders).forEach(([key, value]) => response.headers.set(key, value));
      },
    },
  });

  // Do not put code between createServerClient and getClaims: it refreshes the session.
  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims);
  const { pathname, search } = request.nextUrl;

  const redirectTo = (path: string, params?: Record<string, string>) => {
    const target = request.nextUrl.clone();
    target.pathname = path;
    target.search = params ? `?${new URLSearchParams(params)}` : "";
    const redirect = NextResponse.redirect(target);
    // Keep refreshed session cookies and no-cache headers on the redirect.
    setCookies.forEach(({ name, value, options }) => redirect.cookies.set(name, value, options));
    Object.entries(noCacheHeaders).forEach(([key, value]) => redirect.headers.set(key, value));
    return redirect;
  };

  if (matches(pathname, PUBLIC)) return response;

  if (matches(pathname, GUEST_ONLY)) {
    return signedIn ? redirectTo("/") : response;
  }

  if (!signedIn) {
    const next = `${pathname}${search}`;
    return redirectTo("/login", next === "/" ? undefined : { next });
  }

  return response;
}
