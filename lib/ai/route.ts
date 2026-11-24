import "server-only";
import { after, NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";
import type { TokenUsage } from "@/lib/ai/gemini";
import { createClient } from "@/lib/supabase/server";

export type AiKind = "recognize" | "voice_place" | "search" | "translate" | "transcribe" | "categorize";

/** Error codes returned by /api/ai/* as { error }. The client maps them to dictionary keys. */
export type AiErrorCode =
  | "unauthorized"
  | "accountInactive"
  | "badRequest"
  | "aiLimit"
  | "itemsLimit"
  | "aiBusy"
  | "aiProviderQuota"
  | "aiFailed";

export function aiError(code: AiErrorCode, status: number) {
  return NextResponse.json({ error: code }, { status });
}

/** Fallback daily AI limit when a plan has none set (plans.ai_daily_limit is null). */
export function dailyLimit() {
  const n = Number.parseInt(process.env.AI_DAILY_LIMIT_PER_USER ?? "", 10);
  return Number.isFinite(n) && n > 0 ? n : 100;
}

export type QuotaResult = "ok" | "limit" | "itemsLimit" | "inactive" | "error";
export type Quota = { result: QuotaResult; /** Pass to generateJson as onUsage. */ onUsage: (usage: TokenUsage) => void };

type Supabase = Awaited<ReturnType<typeof createClient>>;

/**
 * Writes the tokens into the recorded request, after the answer is sent (statistics for the
 * admin: a failure is only logged and never affects the user).
 */
function usageRecorder(supabase: Supabase, usageId: string) {
  return (u: TokenUsage) =>
    after(async () => {
      const { error } = await supabase.rpc("record_ai_tokens", {
        p_usage_id: usageId,
        p_model: u.model,
        p_input: u.input,
        p_audio: u.audio,
        p_output: u.output,
      });
      if (error) console.error("record_ai_tokens failed", { code: error.code });
    });
}

/**
 * Checks the plan and records one AI call, atomically in the database (consume_ai_quota_v3):
 * - the user's items reached the plan's item limit -> "itemsLimit": all AI is off, nothing recorded;
 * - the plan's daily AI limit (rolling 24 h, all kinds) is used up -> "limit";
 * - admins are never limited. Pending and disabled accounts get 42501 -> "inactive".
 * Always called before Gemini, so a refused request costs nothing.
 */
export async function consumeQuota(supabase: Supabase, kind: AiKind): Promise<Quota> {
  const none = (result: QuotaResult): Quota => ({ result, onUsage: () => {} });
  const { data, error } = await supabase.rpc("consume_ai_quota_v3", { p_kind: kind, p_fallback: dailyLimit() });
  if (error?.code === "42501") return none("inactive");
  if (error) {
    console.error("consume_ai_quota_v3 failed", { code: error.code });
    return none("error");
  }
  const row = data?.[0];
  if (row?.result === "items_limit") return none("itemsLimit");
  if (row?.result !== "ok") return none("limit");
  return { result: "ok", onUsage: usageRecorder(supabase, row.usage_id) };
}

export function quotaError(result: Exclude<QuotaResult, "ok">) {
  if (result === "inactive") return aiError("accountInactive", 403);
  if (result === "itemsLimit") return aiError("itemsLimit", 403);
  if (result === "limit") return aiError("aiLimit", 429);
  return aiError("aiFailed", 500);
}

type Guard =
  | { ok: true; user: User; supabase: Supabase; onUsage: Quota["onUsage"] }
  | { ok: false; response: NextResponse };

/**
 * Common start of every AI route: session check, then the daily quota
 * (checked and recorded atomically in the database, rolling 24 hours, shared by all kinds;
 * the same database call refuses pending and disabled accounts).
 * Call it after validating the input, so malformed requests do not spend the quota.
 */
export async function guardAiRequest(kind: AiKind): Promise<Guard> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, response: aiError("unauthorized", 401) };

  const quota = await consumeQuota(supabase, kind);
  if (quota.result !== "ok") return { ok: false, response: quotaError(quota.result) };

  return { ok: true, user, supabase, onUsage: quota.onUsage };
}
