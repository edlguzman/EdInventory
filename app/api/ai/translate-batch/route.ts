import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getDataLang, getUser } from "@/lib/auth";
import { aiError } from "@/lib/ai/route";
import { createClient } from "@/lib/supabase/server";
import { slotsFor, translateRecords } from "@/lib/translate/records";

// A pack of up to 40 records can take Gemini a while.
export const maxDuration = 60;

const inputSchema = z.object({
  /** "en": fill missing English; "local": into the user's language. Default: English first, then local. */
  slot: z.enum(["en", "local"]).optional(),
  /** Only these records ("Translate" on one record); default: the next pack of all missing. */
  targets: z
    .array(z.object({ type: z.enum(["item", "location", "category"]), id: z.uuid() }))
    .min(1)
    .max(10)
    .optional(),
});

/**
 * Translates the next pack of the user's records that lack English or text in the user's
 * language. Records are read from the database with the user's session (RLS), never taken
 * from the client. Answers { translated, remaining }; one pack = 1 unit of the limit
 * (a slot with nothing to do costs nothing).
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const input = inputSchema.safeParse(body ?? {});
  if (!input.success) return aiError("badRequest", 400);

  const user = await getUser();
  if (!user) return aiError("unauthorized", 401);

  const { lang } = await getDataLang();
  const slots = slotsFor(lang).filter((s) => !input.data.slot || s === input.data.slot);
  const supabase = await createClient();
  let translated = 0;
  let remaining = 0;
  for (const slot of slots) {
    const outcome = await translateRecords(supabase, { slot, lang, targets: input.data.targets });
    if (!outcome.ok) return aiError(outcome.error, outcome.status);
    translated += outcome.translated;
    remaining += outcome.remaining;
    // One pack per call: stop after the first slot that had work.
    if (outcome.translated > 0) break;
  }
  return NextResponse.json({ translated, remaining });
}
