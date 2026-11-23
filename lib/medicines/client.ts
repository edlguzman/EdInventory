"use client";

import type { FdaDrugInfo } from "@/lib/ai/types";
import type { BookLookupError } from "@/lib/books/client";

/** Official US drug data by NDC (server: openFDA, no AI). null = the FDA does not know this NDC. */
export async function lookupDrug(ndc: string): Promise<{ drug: FdaDrugInfo | null } | { error: BookLookupError }> {
  try {
    const res = await fetch("/api/medicines/ndc", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ndc }),
    });
    const data = (await res.json().catch(() => null)) as { drug?: FdaDrugInfo | null; error?: BookLookupError } | null;
    if (!res.ok || !data) return { error: data?.error ?? "network" };
    return { drug: data.drug ?? null };
  } catch {
    return { error: "network" };
  }
}
