"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Languages } from "lucide-react";
import { useTranslations } from "next-intl";
import { useAiOff, usePlanLimitText } from "@/components/plan-context";
import { useOffline } from "@/components/offline-banner";
import { Alert, Button } from "@/components/ui/buttons";
import { translateBatch } from "@/lib/ai/client";
import { useErrorText } from "@/lib/use-error-text";
import { useDataLang } from "./context";

/** Text of a record with the local slot passed through ownLocal (null = not in my language). */
type Texts = { name_local: string | null; name_en: string | null; description_local?: string | null; description_en?: string | null };

/**
 * Text the user can see is missing: no text in my language (local modes), or no English
 * next to it (local_en). English alone is never asked for (en mode has nothing to translate).
 */
export function lacksVisibleText(mode: string, r: Texts) {
  if (mode === "en") return false;
  const local = (!r.name_local && !!r.name_en) || (!r.description_local && !!r.description_en);
  const en = (!r.name_en && !!r.name_local) || (!r.description_en && !!r.description_local);
  return local || (mode === "local_en" && en);
}

/**
 * "Translate" on one record (item, place or category) that lacks text in a language
 * the current mode shows. 1 unit of the daily AI limit; nothing is sent if nothing is missing.
 */
export function TranslateRecordButton({
  type,
  id,
  texts,
  compact = false,
}: {
  type: "item" | "location" | "category";
  id: string;
  texts: Texts;
  compact?: boolean;
}) {
  const t = useTranslations("dataLang");
  const errorText = useErrorText();
  const router = useRouter();
  const { mode } = useDataLang();
  const offline = useOffline();
  const aiOff = useAiOff();
  const limitText = usePlanLimitText();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  if (!lacksVisibleText(mode, texts)) return null;

  const translate = async () => {
    setPending(true);
    setError(undefined);
    const r = await translateBatch({ targets: [{ type, id }] });
    setPending(false);
    if ("error" in r) return setError(r.error);
    router.refresh();
  };

  if (compact) {
    return (
      <button
        type="button"
        onClick={translate}
        disabled={pending || offline || aiOff}
        aria-label={t("translateRecord")}
        title={limitText ?? (error ? errorText(error) : t("translateRecord"))}
        className={`flex size-11 items-center justify-center rounded-xl disabled:opacity-50 ${error ? "text-red-600" : "text-accent"}`}
      >
        <Languages className={`size-5 ${pending ? "animate-pulse" : ""}`} aria-hidden />
      </button>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <Button onClick={translate} pending={pending} disabled={offline || aiOff} title={limitText} className="self-start">
        {!pending && <Languages className="size-5" aria-hidden />}
        {t("translateRecord")}
      </Button>
      {error && <Alert>{errorText(error)}</Alert>}
    </div>
  );
}
