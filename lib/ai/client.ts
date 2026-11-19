import type { TranslateRequest } from "./translate-schema";

/** Dictionary keys (namespace "errors") for AI failures shown to the user. */
export type AiClientError = "aiLimit" | "aiBusy" | "aiFailed" | "unauthorized" | "network";

export async function translateName(input: TranslateRequest): Promise<{ text: string } | { error: AiClientError }> {
  try {
    const res = await fetch("/api/ai/translate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    const data: unknown = await res.json().catch(() => null);
    if (res.ok && data && typeof data === "object" && "text" in data && typeof data.text === "string") {
      return { text: data.text };
    }
    if (res.status === 429) return { error: "aiLimit" }; // our daily limit
    if (res.status === 503) return { error: "aiBusy" }; // Google overloaded / rate limited
    if (res.status === 401) return { error: "unauthorized" };
    return { error: "aiFailed" };
  } catch {
    return { error: "network" };
  }
}
