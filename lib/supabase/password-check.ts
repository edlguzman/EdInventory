import "server-only";
import { createClient } from "@supabase/supabase-js";
import { supabaseEnv } from "./env";

/**
 * Checks the user's password without touching the current session: signing in with the session's
 * client would replace it and lose the code of the second step. The session made here is closed.
 */
export async function checkPassword(email: string, password: string): Promise<"ok" | "wrongPassword" | "rateLimit"> {
  const { url, anonKey } = supabaseEnv();
  const client = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) return error.status === 429 ? "rateLimit" : "wrongPassword";
  await client.auth.signOut({ scope: "local" }).catch(() => undefined);
  return "ok";
}
