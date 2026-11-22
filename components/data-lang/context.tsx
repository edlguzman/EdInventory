"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { translateBatch, type AiClientError } from "@/lib/ai/client";
import { displaySlot, editSlots, type DataLang, type DataMode, type Slot } from "@/lib/data-lang";
import type { Lang } from "@/lib/languages";

export type TranslationJob = {
  done: number;
  total: number;
  running: boolean;
  /** Background catch-up of missing English: no progress bar. */
  silent: boolean;
  error?: AiClientError;
};

type Ctx = {
  /** "My language" (interface and records). */
  lang: Lang;
  showEnglish: boolean;
  mode: DataMode;
  /** Slot the data is shown in (with fallback to the other one). */
  display: Slot;
  /** Name/description fields shown in forms. */
  edit: Slot[];
  job: TranslationJob | null;
  /** Translate records lacking `slot`, pack after pack, with progress. */
  startTranslation: (slot: Slot, total: number) => void;
  stopTranslation: () => void;
  dismissJob: () => void;
};

const DataLangContext = createContext<Ctx | null>(null);

/** Stop a silent catch-up after this many packs per app start (protects the daily limit). */
const SILENT_MAX_PACKS = 5;

/**
 * The user's language and record mode for the (app) screens plus the background pack
 * translation. It lives in the layout, so the translation keeps going while the user moves
 * around. `silentMissingEn`: records still without English (e.g. a save whose background
 * translation failed); they are caught up quietly (every language but English).
 */
export function DataLangProvider({
  data,
  silentMissingEn,
  children,
}: {
  data: DataLang;
  silentMissingEn: number;
  children: React.ReactNode;
}) {
  const { mode, lang, showEnglish } = data;
  const router = useRouter();
  const [job, setJob] = useState<TranslationJob | null>(null);
  const stopRef = useRef(false);
  const runningRef = useRef(false);

  const run = useCallback(
    async (slot: Slot, total: number, silent: boolean) => {
      if (runningRef.current) return;
      runningRef.current = true;
      stopRef.current = false;
      let done = 0;
      let packs = 0;
      setJob({ done, total, running: true, silent });
      try {
        while (!stopRef.current) {
          const r = await translateBatch({ slot });
          packs++;
          if ("error" in r) {
            setJob({ done, total, running: false, silent, error: r.error });
            return;
          }
          done += r.translated;
          total = Math.max(total, done + r.remaining);
          setJob({ done, total, running: r.remaining > 0 && r.translated > 0, silent });
          router.refresh();
          // Nothing left, or nothing could be translated (avoid looping on the same records).
          if (r.remaining === 0 || r.translated === 0) break;
          if (silent && packs >= SILENT_MAX_PACKS) break;
        }
        setJob((j) => (j ? { ...j, running: false } : j));
      } finally {
        runningRef.current = false;
      }
    },
    [router],
  );

  // Quiet catch-up of missing English, once per app start.
  const caughtUp = useRef(false);
  useEffect(() => {
    if (mode === "en" || silentMissingEn === 0 || caughtUp.current) return;
    caughtUp.current = true;
    void run("en", silentMissingEn, true);
  }, [mode, silentMissingEn, run]);

  const value = useMemo<Ctx>(
    () => ({
      lang,
      showEnglish,
      mode,
      display: displaySlot(mode),
      edit: editSlots(mode),
      job,
      startTranslation: (slot, total) => void run(slot, total, false),
      stopTranslation: () => {
        stopRef.current = true;
      },
      dismissJob: () => setJob(null),
    }),
    [lang, showEnglish, mode, job, run],
  );

  return <DataLangContext.Provider value={value}>{children}</DataLangContext.Provider>;
}

export function useDataLang() {
  const ctx = useContext(DataLangContext);
  if (!ctx) throw new Error("useDataLang must be used inside DataLangProvider");
  return ctx;
}
