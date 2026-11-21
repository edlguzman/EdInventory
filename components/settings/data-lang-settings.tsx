"use client";

import { useState, useTransition } from "react";
import { Check, Languages } from "lucide-react";
import { HelpButton } from "@/components/help/help-sheet";
import { useTranslations } from "next-intl";
import { setDataLang } from "@/app/(app)/settings/data-lang-actions";
import { useDataLang } from "@/components/data-lang/context";
import { useAiOff, usePlanLimitText } from "@/components/plan-context";
import { useOffline } from "@/components/offline-banner";
import { Alert, Button } from "@/components/ui/buttons";
import { Sheet } from "@/components/ui/sheet";
import { DATA_LANGS, promptLangs, type DataLang, type TextLang } from "@/lib/data-lang";

/**
 * "Data languages" in Settings: en / ru / ru_en. Switching is instant (the other language
 * is only hidden); if records then lack text in a shown language, the user is asked whether
 * to translate them now (packs in the background) or later.
 * `untranslated`: records lacking text in the current mode's shown languages (server count).
 */
export function DataLangSettings({ untranslated }: { untranslated: number }) {
  const t = useTranslations("dataLang");
  const tErrors = useTranslations("errors");
  const { mode, job, startTranslation } = useDataLang();
  const offline = useOffline();
  const aiOff = useAiOff();
  const limitText = usePlanLimitText();
  const [pending, startTransition] = useTransition();
  const [ask, setAsk] = useState<{ missing: number; langs: TextLang[] } | null>(null);
  const [error, setError] = useState(false);
  const running = !!job?.running && !job.silent;

  const choose = (next: DataLang) => {
    if (next === mode || pending) return;
    startTransition(async () => {
      setError(false);
      const r = await setDataLang(next);
      if (!r.ok) return setError(true);
      if (r.missing > 0) setAsk({ missing: r.missing, langs: r.langs });
    });
  };

  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="flex items-center gap-1 text-sm font-medium text-muted">
          {t("title")}
          <HelpButton topic="languages" small />
        </h2>
        <p className="mt-1 text-sm text-muted">{t("intro")}</p>
      </div>
      {error && <Alert>{tErrors("unknown")}</Alert>}
      <div role="radiogroup" aria-label={t("title")} className="flex flex-col divide-y divide-border rounded-xl border border-border">
        {DATA_LANGS.map((option) => {
          const selected = option === mode;
          return (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={pending}
              onClick={() => choose(option)}
              className="flex min-h-14 items-center gap-3 px-4 py-2 text-left disabled:opacity-60"
            >
              <span
                className={`flex size-5 shrink-0 items-center justify-center rounded-full border-2 ${
                  selected ? "border-accent bg-accent text-accent-foreground" : "border-border"
                }`}
                aria-hidden
              >
                {selected && <Check className="size-3" strokeWidth={3} />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{t(`options.${option}.title`)}</span>
                <span className="block text-sm text-muted">{t(`options.${option}.hint`)}</span>
              </span>
            </button>
          );
        })}
      </div>

      {untranslated > 0 && !running && !ask && (
        <div className="flex items-center gap-3 rounded-xl bg-surface px-4 py-2">
          <Languages className="size-5 shrink-0 text-accent" aria-hidden />
          <span className="min-w-0 flex-1 text-sm">{t("untranslated", { count: untranslated })}</span>
          <Button variant="ghost" disabled={offline || aiOff} title={limitText} onClick={() => startTranslation(promptLangs(mode), untranslated)} className="-mr-3">
            {t("translateAll")}
          </Button>
        </div>
      )}

      <Sheet
        open={!!ask}
        onClose={() => setAsk(null)}
        title={t("askTitle")}
        footer={
          <div className="flex gap-2">
            <Button onClick={() => setAsk(null)} className="flex-1">
              {t("later")}
            </Button>
            <Button
              variant="primary"
              disabled={offline || aiOff}
              title={limitText}
              className="flex-1"
              onClick={() => {
                if (ask) startTranslation(ask.langs, ask.missing);
                setAsk(null);
              }}
            >
              {t("translateNow")}
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-3">
          <p>{t("askText", { count: ask?.missing ?? 0 })}</p>
          <p className="text-sm text-muted">{t("laterHint")}</p>
        </div>
      </Sheet>
    </section>
  );
}
