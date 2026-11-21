import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { normalizeIsbn } from "@/lib/books/isbn";
import { lookupIsbn } from "@/lib/books/lookup";
import { catalogueRateLimited } from "@/lib/books/rate-limit";
import { createClient } from "@/lib/supabase/server";

const bodySchema = z.object({ isbn: z.string().min(10).max(20) });

/**
 * ISBN -> book data from Open Library / Google Books (only the ISBN leaves the server). Not AI:
 * no daily AI quota is spent, but only signed-in active accounts may use it. The answer only
 * prefills the form.
 */
export async function POST(request: NextRequest) {
  const body = bodySchema.safeParse(await request.json().catch(() => null));
  const isbn = body.success ? normalizeIsbn(body.data.isbn) : null;
  if (!isbn) return NextResponse.json({ error: "badRequest" }, { status: 400 });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { data: active } = await supabase.rpc("is_active");
  if (!active) return NextResponse.json({ error: "accountInactive" }, { status: 403 });
  if (catalogueRateLimited(user.id)) return NextResponse.json({ error: "rateLimited" }, { status: 429 });

  const book = await lookupIsbn(isbn);
  return NextResponse.json({ book });
}
