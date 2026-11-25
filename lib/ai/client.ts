import type { TranslateRequest } from "./translate-schema";
import type {
  CategorizeResult,
  IsbnReadResult,
  MedicineSummaryResult,
  ItemContext,
  PlaceMode,
  PlaceResult,
  RecognizeMultiResult,
  RecognizeSingleResult,
  SearchResult,
  TranscribeResult,
  VoiceAddResult,
} from "./types";

/** Dictionary keys (namespace "errors") for AI failures shown to the user. */
export type AiClientError =
  | "aiLimit"
  | "itemsLimit"
  | "aiBusy"
  | "aiProviderQuota"
  | "aiFailed"
  | "unauthorized"
  | "accountInactive"
  | "network";

const KNOWN: readonly string[] = ["aiLimit", "itemsLimit", "aiBusy", "aiProviderQuota", "aiFailed", "unauthorized", "accountInactive"];

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

/** Categories for up to 50 items (ids only: the server reads their texts). 1 AI request. */
export function categorizeItems(ids: string[]) {
  return call<CategorizeResult>(
    "/api/ai/categorize",
    { headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids }) },
    (d): d is CategorizeResult => isObject(d) && Array.isArray(d.items),
  );
}

/** Printed ISBNs on a photo of a back cover / copyright page. 1 AI request; the photo is not stored. */
export function readIsbn(image: Blob) {
  return call<IsbnReadResult>("/api/ai/isbn", form({ image }), (d): d is IsbnReadResult => isObject(d) && Array.isArray(d.isbns));
}

function form(parts: { audio?: Blob | null; image?: Blob | null; text?: string; meta?: unknown }) {
  const body = new FormData();
  if (parts.audio) body.set("audio", parts.audio, "phrase.wav");
  if (parts.image) body.set("image", parts.image, "photo.jpg");
  if (parts.text) body.set("text", parts.text);
  if (parts.meta !== undefined) body.set("meta", JSON.stringify(parts.meta));
  return { body };
}

/**
 * Photos of one item (1-4, sides of a package) -> its data. 1 unit of the daily limit.
 * `ndc`: a drug NDC read from a barcode on the phone (the server adds the official FDA data).
 */
export function recognizeItem(images: Blob[], options: { ndc?: string | null } = {}) {
  const body = new FormData();
  images.slice(0, 4).forEach((image, i) => body.append("image", image, `photo-${i + 1}.jpg`));
  body.set("meta", JSON.stringify(options.ndc ? { ndc: options.ndc } : {}));
  return call<RecognizeSingleResult>("/api/ai/recognize", { body }, (d): d is RecognizeSingleResult => isObject(d) && typeof d.name_local === "string");
}

/** NDC -> official FDA data, uses and warnings condensed by the AI (1 request; none if the FDA does not know it). */
export function medicineSummary(ndc: string) {
  return call<MedicineSummaryResult>(
    "/api/ai/medicine-summary",
    { headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ndc }) },
    (d): d is MedicineSummaryResult => isObject(d) && "drug" in d,
  );
}

/** Photo of a shelf or a tool board -> every separate item with its box. 1 unit of the daily limit. */
export function recognizeItems(image: Blob, locale: string) {
  return call<RecognizeMultiResult>(
    "/api/ai/recognize-multi",
    form({ image, meta: { locale } }),
    (d): d is RecognizeMultiResult => isObject(d) && Array.isArray(d.items),
  );
}

/** Dictation into one field: the recording -> text in the field's language. 1 unit of the daily limit. */
export function transcribe(audio: Blob, meta: { slot: "local" | "en"; kind: "name" | "description" }) {
  return call<TranscribeResult>(
    "/api/ai/transcribe",
    form({ audio, meta }),
    (d): d is TranscribeResult => isObject(d) && typeof d.text === "string",
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

/** One phrase -> new items with their places. 1 unit of the daily limit; nothing is saved. */
export function voiceAdd(input: { audio?: Blob | null; text?: string; currentLocationId: string | null }) {
  return call<VoiceAddResult>(
    "/api/ai/voice-add",
    form({ audio: input.audio, text: input.text, meta: { current_location_id: input.currentLocationId } }),
    (d): d is VoiceAddResult => isObject(d) && Array.isArray(d.items) && Array.isArray(d.places),
  );
}

export function askSearch(input: { audio?: Blob | null; text?: string }) {
  return call<SearchResult>(
    "/api/ai/search",
    form({ audio: input.audio, text: input.text }),
    (d): d is SearchResult => isObject(d) && Array.isArray(d.terms),
  );
}

export type TranslateBatchResult = { translated: number; remaining: number };

/**
 * Translates the next pack of records lacking `langs` (or only `targets`).
 * The server reads the records itself; one pack = 1 unit of the daily limit.
 */
export function translateBatch(input: {
  slot?: "en" | "local";
  targets?: { type: "item" | "location" | "category"; id: string }[];
}) {
  return call<TranslateBatchResult>(
    "/api/ai/translate-batch",
    { headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) },
    (d): d is TranslateBatchResult => isObject(d) && typeof d.translated === "number" && typeof d.remaining === "number",
  );
}
