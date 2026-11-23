import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { catalogueRateLimited } from "@/lib/books/rate-limit";
import { lookupNdc, publicDrug } from "@/lib/medicines/fda";
import { normalizeNdc } from "@/lib/medicines/ndc";
import { createClient } from "@/lib/supabase/server";

const bodySchema = z.object({ ndc: z.string().min(10).max(20) });

/**
 * NDC -> official US drug data from openFDA (only the NDC leaves the server). Not AI: no daily
 * AI quota is spent, but only signed-in active accounts may use it; it shares the per-minute
 * limit with the book catalogues. The answer only prefills the form.
 */
export async function POST(request: NextRequest) {
  const body = bodySchema.safeParse(await request.json().catch(() => null));
  const ndc = body.success ? normalizeNdc(body.data.ndc) : null;
  if (!ndc) return NextResponse.json({ error: "badRequest" }, { status: 400 });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { data: active } = await supabase.rpc("is_active");
  if (!active) return NextResponse.json({ error: "accountInactive" }, { status: 403 });
  if (catalogueRateLimited(user.id)) return NextResponse.json({ error: "rateLimited" }, { status: 429 });

  const drug = await lookupNdc(ndc);
  return NextResponse.json({ drug: drug ? publicDrug(drug) : null });
}
