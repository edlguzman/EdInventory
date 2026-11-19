import type { TranslateRequest } from "./translate-schema";

/** Dictionary keys (namespace "errors") for AI failures shown to the user. */
export type AiClientError = "aiLimit" | "aiBusy" | "aiProviderQuota" | "aiFailed" | "unauthorized" | "network";

const KNOWN: readonly string[] = ["aiLimit", "aiBusy", "aiProviderQuota", "aiFailed", "unauthorized"];

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
    // Routes answer { error: AiErrorCode }; use it when it is one we know.
    const code = data && typeof data === "object" && "error" in data ? data.error : undefined;
    if (typeof code === "string" && KNOWN.includes(code)) return { error: code as AiClientError };
    return { error: res.status === 401 ? "unauthorized" : "aiFailed" };
  } catch {
    return { error: "network" };
  }
}
