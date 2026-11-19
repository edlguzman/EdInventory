import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import { supabaseEnv } from "./env";

/**
 * Supabase client with the service role key: bypasses RLS. Used in exactly one place,
 * the admin "delete user" action (the user's Storage files and the auth user), and only
 * after admin_check_delete() has passed with the admin's own session.
 * Never import it anywhere else; never expose the key (no NEXT_PUBLIC_ prefix).
 */
export function createServiceClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set (see .env.example)");
  return createClient<Database>(supabaseEnv().url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
