import "server-only";
import { after } from "next/server";
import type { DataLang } from "@/lib/data-lang";
import { createClient } from "@/lib/supabase/server";
import { translateRecords, type RecordRef } from "./records";

/**
 * Ru mode: English is kept filled in automatically. After a save, the records that lack
 * English are translated in the background (after the response, 1 unit of the limit).
 * A failure never affects the save: such records are caught up later in packs.
 */
export function translateAfterSave(mode: DataLang, refs: RecordRef[]) {
  if (mode !== "ru" || refs.length === 0) return;
  after(async () => {
    try {
      const supabase = await createClient();
      const outcome = await translateRecords(supabase, { langs: ["en"], targets: refs.slice(0, 10) });
      if (!outcome.ok) console.error("translate after save failed", { error: outcome.error });
    } catch (error) {
      console.error("translate after save failed", { name: error instanceof Error ? error.name : "unknown" });
    }
  });
}
