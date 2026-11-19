import { timingSafeEqual } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/lib/supabase/database.types";
import { supabaseEnv } from "@/lib/supabase/env";

/**
 * Daily ping from Vercel Cron (vercel.json) so the Supabase Free project never pauses.
 * Vercel sends "Authorization: Bearer <CRON_SECRET>"; anything else gets 401.
 */
export const dynamic = "force-dynamic";

function authorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // fail closed when the secret is not configured
  const got = Buffer.from(request.headers.get("authorization") ?? "");
  const want = Buffer.from(`Bearer ${secret}`);
  return got.length === want.length && timingSafeEqual(got, want);
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { url, anonKey } = supabaseEnv();
  // No user session here: a plain anon client, nothing stored.
  const supabase = createClient<Database>(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await supabase.rpc("keepalive");
  if (error) {
    console.error("keepalive failed", { code: error.code });
    return NextResponse.json({ ok: false }, { status: 502 });
  }

  console.log("keepalive ok", { dbTime: data });
  return NextResponse.json({ ok: true, dbTime: data });
}
