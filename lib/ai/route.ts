import "server-only";
import { NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

export type AiKind = "recognize" | "voice_place" | "search" | "translate";

/** Error codes returned by /api/ai/* as { error }. The client maps them to dictionary keys. */
export type AiErrorCode = "unauthorized" | "badRequest" | "aiLimit" | "aiBusy" | "aiFailed";

export function aiError(code: AiErrorCode, status: number) {
  return NextResponse.json({ error: code }, { status });
}

function dailyLimit() {
  const n = Number.parseInt(process.env.AI_DAILY_LIMIT_PER_USER ?? "", 10);
  return Number.isFinite(n) && n > 0 ? n : 100;
}

type Guard =
  | { ok: true; user: User; supabase: Awaited<ReturnType<typeof createClient>> }
  | { ok: false; response: NextResponse };

/**
 * Common start of every AI route: session check, then the daily quota
 * (checked and recorded atomically in the database, rolling 24 hours, shared by all kinds).
 * Call it after validating the input, so malformed requests do not spend the quota.
 */
export async function guardAiRequest(kind: AiKind): Promise<Guard> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, response: aiError("unauthorized", 401) };

  const { data: allowed, error } = await supabase.rpc("consume_ai_quota", { p_kind: kind, p_limit: dailyLimit() });
  if (error) {
    console.error("consume_ai_quota failed", { code: error.code });
    return { ok: false, response: aiError("aiFailed", 500) };
  }
  if (!allowed) return { ok: false, response: aiError("aiLimit", 429) };

  return { ok: true, user, supabase };
}
