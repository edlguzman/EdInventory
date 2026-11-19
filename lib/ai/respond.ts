import "server-only";
import { ApiError } from "@google/genai";
import { isAiBusy, isProviderQuotaExhausted } from "./gemini";
import { aiError } from "./route";

/** Maps a Gemini failure to the route's error answer. Logs only the error type and status. */
export function aiFailure(route: string, error: unknown) {
  console.error(`${route} failed`, {
    name: error instanceof Error ? error.name : "unknown",
    status: error instanceof ApiError ? error.status : undefined,
  });
  if (isProviderQuotaExhausted(error)) return aiError("aiProviderQuota", 503);
  return isAiBusy(error) ? aiError("aiBusy", 503) : aiError("aiFailed", 502);
}

/** Tags: trimmed, lower case, unique, short. */
export function cleanTags(tags: string[], max = 10) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of tags) {
    const t = raw.trim().toLowerCase().slice(0, 50);
    if (t && !seen.has(t)) {
      seen.add(t);
      out.push(t);
    }
    if (out.length >= max) break;
  }
  return out;
}
