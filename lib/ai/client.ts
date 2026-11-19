import type { TranslateRequest } from "./translate-schema";
import type { ItemContext, PlaceMode, PlaceResult, RecognizeResult, SearchResult } from "./types";

/** Dictionary keys (namespace "errors") for AI failures shown to the user. */
export type AiClientError = "aiLimit" | "aiBusy" | "aiProviderQuota" | "aiFailed" | "unauthorized" | "accountInactive" | "network";

const KNOWN: readonly string[] = ["aiLimit", "aiBusy", "aiProviderQuota", "aiFailed", "unauthorized", "accountInactive"];

type AiResponse<T> = T | { error: AiClientError };

async function call<T>(url: string, init: RequestInit, isOk: (data: unknown) => data is T): Promise<AiResponse<T>> {
  try {
    const res = await fetch(url, { method: "POST", ...init });
    const data: unknown = await res.json().catch(() => null);
    if (res.ok && isOk(data)) return data;
    // Routes answer { error: AiErrorCode }; use it when it is one we know.
    const code = data && typeof data === "object" && "error" in data ? data.error : undefined;
    if (typeof code === "string" && KNOWN.includes(code)) return { error: code as AiClientError };
    return { error: res.status === 401 ? "unauthorized" : "aiFailed" };
  } catch {
    return { error: "network" };
  }
}

const isObject = (d: unknown): d is Record<string, unknown> => !!d && typeof d === "object" && !("error" in d);

export function translateName(input: TranslateRequest) {
  return call<{ text: string }>(
    "/api/ai/translate",
    { headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) },
    (d): d is { text: string } => isObject(d) && typeof d.text === "string",
  );
}

function form(parts: { audio?: Blob | null; image?: Blob | null; text?: string; meta?: unknown }) {
  const body = new FormData();
  if (parts.audio) body.set("audio", parts.audio, "phrase.wav");
  if (parts.image) body.set("image", parts.image, "photo.jpg");
  if (parts.text) body.set("text", parts.text);
  if (parts.meta !== undefined) body.set("meta", JSON.stringify(parts.meta));
  return { body };
}

export function recognizeItem(image: Blob, locale: string) {
  return call<RecognizeResult>(
    "/api/ai/recognize",
    form({ image, meta: { locale } }),
    (d): d is RecognizeResult => isObject(d) && typeof d.name_ru === "string",
  );
}

export function askPlace(input: {
  audio?: Blob | null;
  text?: string;
  mode: PlaceMode;
  currentLocationId: string | null;
  item?: ItemContext | null;
}) {
  return call<PlaceResult>(
    "/api/ai/place",
    form({
      audio: input.audio,
      text: input.text,
      meta: { mode: input.mode, current_location_id: input.currentLocationId, item: input.item ?? null },
    }),
    (d): d is PlaceResult => isObject(d) && "match" in d,
  );
}

export function askSearch(input: { audio?: Blob | null; text?: string }) {
  return call<SearchResult>(
    "/api/ai/search",
    form({ audio: input.audio, text: input.text }),
    (d): d is SearchResult => isObject(d) && Array.isArray(d.terms),
  );
}
