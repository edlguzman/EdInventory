"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Languages } from "lucide-react";
import { useTranslations } from "next-intl";
import { useOffline } from "@/components/offline-banner";
import { Alert, Button } from "@/components/ui/buttons";
import { translateBatch } from "@/lib/ai/client";
import { useErrorText } from "@/lib/use-error-text";
import { useDataLang } from "./context";

type Texts = { name_ru: string | null; name_en: string | null; description_ru?: string | null; description_en?: string | null };

/** Text the user can see is missing in a language the mode shows (ru mode: Russian; ru_en: either). */
export function lacksVisibleText(mode: string, r: Texts) {
  const langs = mode === "ru" ? ["ru"] : mode === "ru_en" ? ["ru", "en"] : [];
  return langs.some((lang) => {
    const o = lang === "ru" ? "en" : "ru";
    const get = (field: "name" | "description", l: string) => r[`${field}_${l}` as keyof Texts];
    return (!get("name", lang) && !!get("name", o)) || (!get("description", lang) && !!get("description", o));
  });
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
        disabled={pending || offline}
        aria-label={t("translateRecord")}
        title={error ? errorText(error) : t("translateRecord")}
        className={`flex size-11 items-center justify-center rounded-xl disabled:opacity-50 ${error ? "text-red-600" : "text-accent"}`}
      >
        <Languages className={`size-5 ${pending ? "animate-pulse" : ""}`} aria-hidden />
      </button>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <Button onClick={translate} pending={pending} disabled={offline} className="self-start">
        {!pending && <Languages className="size-5" aria-hidden />}
        {t("translateRecord")}
      </Button>
      {error && <Alert>{errorText(error)}</Alert>}
    </div>
  );
}
