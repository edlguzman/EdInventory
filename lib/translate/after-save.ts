import "server-only";
import { after } from "next/server";
import type { DataLang } from "@/lib/data-lang";
import { createClient } from "@/lib/supabase/server";
import { translateRecords, type RecordRef } from "./records";

/**
 * English is kept filled in automatically (every language but English). After a save, the
 * records that lack English (or, with English next to it, lack the own language) are
 * translated in the background (after the response, 1 unit of the limit per job with work).
 * A failure never affects the save: such records are caught up later in packs.
 */
export function translateAfterSave(d: DataLang, refs: RecordRef[]) {
  if (d.mode === "en" || refs.length === 0) return;
  after(async () => {
    try {
      const supabase = await createClient();
      const targets = refs.slice(0, 10);
      for (const slot of ["en", "local"] as const) {
        const outcome = await translateRecords(supabase, { slot, lang: d.lang, targets });
        if (!outcome.ok) console.error("translate after save failed", { error: outcome.error });
      }
    } catch (error) {
      console.error("translate after save failed", { name: error instanceof Error ? error.name : "unknown" });
    }
  });
}
