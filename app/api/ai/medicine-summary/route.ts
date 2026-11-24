import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { languageRule } from "@/lib/ai/context";
import { generateJson } from "@/lib/ai/gemini";
import { cleanMedicine, fdaContext } from "@/lib/ai/medicine";
import { aiFailure } from "@/lib/ai/respond";
import { aiError, guardAiRequest } from "@/lib/ai/route";
import type { MedicineSummaryResult } from "@/lib/ai/types";
import { getDataLang } from "@/lib/auth";
import { catalogueRateLimited } from "@/lib/books/rate-limit";
import { lookupNdc, publicDrug } from "@/lib/medicines/fda";
import { normalizeNdc } from "@/lib/medicines/ndc";
import { createClient } from "@/lib/supabase/server";

const bodySchema = z.object({ ndc: z.string().min(10).max(20) });

// Only the texts to write in the user's language + English; the facts come from the FDA data.
const outputSchema = z.object({
  active_local: z.string(),
  active_en: z.string(),
  form_local: z.string(),
  form_en: z.string(),
  uses_local: z.string(),
  uses_en: z.string(),
  warnings_local: z.string(),
  warnings_en: z.string(),
});

/**
 * "Scan barcode" in a filled form: NDC -> official FDA data -> the AI only condenses the
 * official uses and warnings into 1-2 sentences in the user's language and English (no photo;
 * 1 AI request, kind "recognize"). NDC not known to the FDA -> { drug: null }, no quota spent.
 */
export async function POST(request: NextRequest) {
  const body = bodySchema.safeParse(await request.json().catch(() => null));
  const ndc = body.success ? normalizeNdc(body.data.ndc) : null;
  if (!ndc) return aiError("badRequest", 400);

  // Look the NDC up before spending quota (signed-in, active, per-minute catalogue limit).
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return aiError("unauthorized", 401);
  if (catalogueRateLimited(user.id)) return NextResponse.json({ error: "rateLimited" }, { status: 429 });
  const fda = await lookupNdc(ndc);
  if (!fda) return NextResponse.json({ drug: null, medicine: null } satisfies MedicineSummaryResult);

  const guard = await guardAiRequest("recognize");
  if (!guard.ok) return guard.response;
  const dataLang = await getDataLang();

  try {
    const r = await generateJson(outputSchema, {
      onUsage: guard.onUsage,
      systemInstruction: [
        "You prepare reference notes about a medicine for a personal home inventory.",
        fdaContext(fda),
        "active_* = the active ingredient(s); form_* = the dosage form; uses_* = what it is for, 1-2 short sentences;",
        'warnings_* = only the most important warnings, briefly; "" if the label has nothing significant.',
        "Never give dosing instructions. This is reference information, not medical advice.",
        languageRule(dataLang),
      ].join("\n"),
      contents: "Write the notes for this product.",
      thinking: "low",
      attemptTimeoutsMs: [15_000, 20_000],
    });
    const medicine = cleanMedicine(
      {
        is_medicine: true,
        med_subtype: "medicine",
        med_active_local: r.active_local,
        med_active_en: r.active_en,
        med_strength: "",
        med_form_local: r.form_local,
        med_form_en: r.form_en,
        med_rx: "",
        med_components: [],
        med_expiry: "",
        med_uses_local: r.uses_local,
        med_uses_en: r.uses_en,
        med_warnings_local: r.warnings_local,
        med_warnings_en: r.warnings_en,
        med_ndc: "",
      },
      dataLang.lang,
      fda,
    );
    return NextResponse.json({ drug: publicDrug(fda), medicine } satisfies MedicineSummaryResult);
  } catch (error) {
    return aiFailure("medicine-summary", error);
  }
}
