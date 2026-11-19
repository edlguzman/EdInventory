import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getDataLang, getUser } from "@/lib/auth";
import { aiError } from "@/lib/ai/route";
import { neededLangs } from "@/lib/data-lang";
import { createClient } from "@/lib/supabase/server";
import { translateRecords } from "@/lib/translate/records";

// A pack of up to 40 records can take Gemini a while.
export const maxDuration = 60;

const inputSchema = z.object({
  /** Only these languages (must be needed in the user's mode); default: all needed. */
  langs: z.array(z.enum(["ru", "en"])).max(2).optional(),
  /** Only these records ("Translate" on one record); default: the next pack of all missing. */
  targets: z
    .array(z.object({ type: z.enum(["item", "location", "category"]), id: z.uuid() }))
    .min(1)
    .max(10)
    .optional(),
});

/**
 * Translates the next pack of the user's records that lack text in a language their
 * mode needs. Records are read from the database with the user's session (RLS), never
 * taken from the client. Answers { translated, remaining }; one pack = 1 unit of the limit.
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const input = inputSchema.safeParse(body ?? {});
  if (!input.success) return aiError("badRequest", 400);

  const user = await getUser();
  if (!user) return aiError("unauthorized", 401);

  const allowed = neededLangs(await getDataLang());
  const langs = input.data.langs ? allowed.filter((l) => input.data.langs!.includes(l)) : allowed;

  const supabase = await createClient();
  const outcome = await translateRecords(supabase, { langs, targets: input.data.targets });
  if (!outcome.ok) return aiError(outcome.error, outcome.status);
  return NextResponse.json({ translated: outcome.translated, remaining: outcome.remaining });
}
