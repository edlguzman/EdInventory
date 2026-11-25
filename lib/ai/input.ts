import "server-only";
import type { Part } from "@google/genai";

export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
export const MAX_AUDIO_BYTES = 1.5 * 1024 * 1024;
export const MAX_TEXT = 500;
/** Photos of one item sent together (sides of a package): one AI request. */
export const MAX_IMAGES = 4;

/**
 * Reads a multipart AI request: optional "audio" (WAV made on the client), optional
 * "image" (JPEG made on the client; up to MAX_IMAGES "image" fields: `images`, the first is
 * `image`), optional "text", and a JSON "meta" field.
 * Returns null when the body is malformed or a file is too big / of the wrong type.
 */
export async function readAiForm(
  request: Request,
  { maxText = MAX_TEXT }: { maxText?: number } = {},
): Promise<{
  audio: Blob | null;
  image: Blob | null;
  images: Blob[];
  text: string;
  meta: unknown;
} | null> {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return null;
  }
  const audio = form.get("audio");
  const images = form.getAll("image");
  const image = images[0] ?? null;
  const text = form.get("text");
  const meta = form.get("meta");

  if (audio !== null && (!(audio instanceof Blob) || audio.size === 0 || audio.size > MAX_AUDIO_BYTES || audio.type !== "audio/wav")) return null;
  if (images.length > MAX_IMAGES) return null;
  for (const i of images) {
    if (!(i instanceof Blob) || i.size === 0 || i.size > MAX_IMAGE_BYTES || i.type !== "image/jpeg") return null;
  }
  if (text !== null && (typeof text !== "string" || text.length > maxText)) return null;

  let parsedMeta: unknown = {};
  if (typeof meta === "string") {
    try {
      parsedMeta = JSON.parse(meta);
    } catch {
      return null;
    }
  }
  return {
    audio: audio instanceof Blob ? audio : null,
    image: image instanceof Blob ? image : null,
    images: images.flatMap((i) => (i instanceof Blob ? [i as Blob] : [])),
    text: typeof text === "string" ? text.trim() : "",
    meta: parsedMeta,
  };
}

export async function blobPart(blob: Blob, mimeType: "audio/wav" | "image/jpeg"): Promise<Part> {
  const data = Buffer.from(await blob.arrayBuffer()).toString("base64");
  return { inlineData: { mimeType, data } };
}

/** The user's phrase as Gemini input: the recording if there is one, otherwise the typed text. */
export async function phraseParts(audio: Blob | null, text: string): Promise<Part[]> {
  if (audio) return [await blobPart(audio, "audio/wav"), { text: "The user's request is in the audio above." }];
  return [{ text: `The user's request (typed): """${text}"""` }];
}
