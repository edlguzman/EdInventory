import "server-only";
import { ApiError, GoogleGenAI, ThinkingLevel, type ContentListUnion } from "@google/genai";
import { z } from "zod";

let client: GoogleGenAI | null = null;

function gemini() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set");
  client ??= new GoogleGenAI({ apiKey });
  return client;
}

function model() {
  const name = process.env.GEMINI_MODEL;
  if (!name) throw new Error("GEMINI_MODEL is not set");
  return name;
}

/** JSON Schema for Gemini built from the same zod schema that validates the answer. */
function jsonSchemaFor(schema: z.ZodType) {
  // Gemini does not need the "$schema" dialect marker.
  const json = z.toJSONSchema(schema) as Record<string, unknown>;
  delete json.$schema;
  return json;
}

export class AiOutputError extends Error {}

type GenerateOptions = {
  contents: ContentListUnion;
  systemInstruction?: string;
  temperature?: number;
  /** Reasoning depth for models that support it (Gemini 3.x). "low" keeps simple tasks fast. */
  thinking?: "low" | "high";
  /** Timeout of each attempt; one entry = one attempt. */
  attemptTimeoutsMs?: number[];
};

const isTimeout = (e: unknown) => e instanceof Error && (e.name === "AbortError" || e.name === "TimeoutError");
const isOverloaded = (e: unknown) => e instanceof ApiError && [500, 503].includes(e.status);
const isUnsupportedThinking = (e: unknown) => e instanceof ApiError && e.status === 400 && /thinking/i.test(e.message);

/**
 * Calls Gemini with a structured JSON answer and validates it with zod.
 * Google's latency spikes a lot under load, so each attempt is short and a timed-out
 * or overloaded (500/503) attempt is retried. If the configured model does not support
 * the thinking setting, the same attempt is repeated without it.
 * Throws AiOutputError if the answer does not match the schema.
 */
export async function generateJson<S extends z.ZodType>(
  schema: S,
  { contents, systemInstruction, temperature = 0.2, thinking, attemptTimeoutsMs = [10_000, 15_000] }: GenerateOptions,
): Promise<z.output<S>> {
  let useThinking = thinking !== undefined;
  const call = (timeoutMs: number) =>
    gemini().models.generateContent({
      model: model(),
      contents,
      config: {
        systemInstruction,
        temperature,
        responseMimeType: "application/json",
        responseJsonSchema: jsonSchemaFor(schema),
        ...(useThinking && thinking
          ? { thinkingConfig: { thinkingLevel: thinking === "low" ? ThinkingLevel.LOW : ThinkingLevel.HIGH } }
          : {}),
        abortSignal: AbortSignal.timeout(timeoutMs),
      },
    });

  let response;
  for (let attempt = 0; ; attempt++) {
    try {
      response = await call(attemptTimeoutsMs[attempt]);
      break;
    } catch (error) {
      if (useThinking && isUnsupportedThinking(error)) {
        useThinking = false;
        attempt--; // same attempt, without the thinking setting
        continue;
      }
      const retriable = isTimeout(error) || isOverloaded(error);
      if (!retriable || attempt >= attemptTimeoutsMs.length - 1) throw error;
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  let raw: unknown;
  try {
    raw = JSON.parse(response.text ?? "");
  } catch {
    throw new AiOutputError("Gemini returned non-JSON output");
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw new AiOutputError("Gemini output does not match the schema");
  return parsed.data;
}
