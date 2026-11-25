"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Languages } from "lucide-react";
import { useTranslations } from "next-intl";
import { HelpButton } from "@/components/help/help-sheet";
import {
  previewLanguageChange,
  setMyLanguage,
  setShowEnglish,
  type LanguageChangePreview,
} from "@/app/(app)/settings/data-lang-actions";
import { useDataLang } from "@/components/data-lang/context";
import { useAiOff, usePlanLimitText } from "@/components/plan-context";
import { useOffline } from "@/components/offline-banner";
import { Alert, Button } from "@/components/ui/buttons";
import { Sheet } from "@/components/ui/sheet";
import { LANGUAGES, languageInfo, type Lang } from "@/lib/languages";

type Ask = { next: Lang; preview: Extract<LanguageChangePreview, { ok: true }> };

/**
 * "Language" in Settings: "my language" (interface and records) and "Show English next to it".
 * The language is shown as text; "Change language" opens a window: pick another one, read what
 * happens to saved records, confirm. Nothing changes before that. Records stay as they are and
 * are shown in English until translated; translating them now runs in the background in packs
 * (about N AI requests). `untranslated`: records with no text in my language (server count).
 */
export function DataLangSettings({ untranslated }: { untranslated: number }) {
  const t = useTranslations("dataLang");
  const tErrors = useTranslations("errors");
  const router = useRouter();
  const { lang, showEnglish, job, startTranslation } = useDataLang();
  const offline = useOffline();
  const aiOff = useAiOff();
  const limitText = usePlanLimitText();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [ask, setAsk] = useState<Ask | null>(null);
  const [error, setError] = useState(false);
  const running = !!job?.running && !job.silent;
  const others = LANGUAGES.filter((l) => l.enabled && l.code !== lang);

  const openWindow = () => {
    setError(false);
    setAsk(null);
    setOpen(true);
  };
  // Not while a preview or the change itself is on its way.
  const closeWindow = () => {
    if (!pending) setOpen(false);
  };

  const choose = (next: Lang) => {
    if (next === ask?.next || pending) return;
    startTransition(async () => {
      setError(false);
      setAsk(null);
      const preview = await previewLanguageChange(next);
      if (!preview.ok) return setError(true);
      setAsk({ next, preview });
    });
  };

  const change = (translate: boolean) => {
    if (!ask) return;
    const { next, preview } = ask;
    startTransition(async () => {
      setError(false);
      const r = await setMyLanguage(next);
      if (!r.ok) return setError(true);
      setOpen(false);
      router.refresh();
      if (translate && preview.records > 0) startTranslation("local", preview.records);
    });
  };

  const toggleEnglish = () =>
    startTransition(async () => {
      setError(false);
      const r = await setShowEnglish(!showEnglish);
      if (!r.ok) return setError(true);
      router.refresh();
    });

  // The language named in the interface language ("испанский", "Spanish", "español").
  const nextName = ask ? t(`languageNames.${ask.next}`) : "";
  const canTranslate = !!ask && ask.next !== "en" && ask.preview.records > 0;

  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="flex items-center gap-1 text-sm font-medium text-muted">
          {t("title")}
          <HelpButton topic="languages" small />
        </h2>
        <p className="mt-1 text-sm text-muted">{t("intro")}</p>
      </div>
      {error && !open && <Alert>{tErrors("unknown")}</Alert>}
      <div className="flex items-center justify-between gap-2 rounded-xl border border-border px-4 py-2">
        <p className="min-w-0">
          {t("current")}{" "}
          <span lang={lang} className="font-semibold">
            {languageInfo(lang).native}
          </span>
        </p>
        <Button variant="ghost" onClick={openWindow} disabled={pending} className="-mr-3 shrink-0">
          {t("changeButton")}
        </Button>
      </div>

      {lang !== "en" && (
        <button
          type="button"
          role="switch"
          aria-checked={showEnglish}
          disabled={pending}
          onClick={toggleEnglish}
          className="flex min-h-14 items-center gap-3 rounded-xl border border-border px-4 py-2 text-left disabled:opacity-60"
        >
          <span className="min-w-0 flex-1">
            <span className="block font-medium">{t("showEnglish")}</span>
            <span className="block text-sm text-muted">{t("showEnglishHint")}</span>
          </span>
          <span
            className={`flex h-7 w-12 shrink-0 items-center rounded-full p-0.5 transition-colors ${showEnglish ? "bg-accent" : "bg-border"}`}
            aria-hidden
          >
            <span className={`size-6 rounded-full bg-white shadow transition-transform ${showEnglish ? "translate-x-5" : ""}`} />
          </span>
        </button>
      )}

      {untranslated > 0 && !running && !open && (
        <div className="flex items-center gap-3 rounded-xl bg-surface px-4 py-2">
          <Languages className="size-5 shrink-0 text-accent" aria-hidden />
          <span className="min-w-0 flex-1 text-sm">{t("untranslated", { count: untranslated })}</span>
          <Button
            variant="ghost"
            disabled={offline || aiOff}
            title={limitText}
            onClick={() => startTranslation("local", untranslated)}
            className="-mr-3"
          >
            {t("translateAll")}
          </Button>
        </div>
      )}

      <Sheet
        open={open}
        onClose={closeWindow}
        title={t("changeButton")}
        footer={
          <div className="flex flex-col gap-2">
            {canTranslate && (
              <Button variant="primary" pending={pending} disabled={offline || aiOff} title={limitText} onClick={() => change(true)}>
                {t("changeAndTranslate")}
              </Button>
            )}
            <div className="flex gap-2">
              <Button onClick={closeWindow} disabled={pending} className="flex-1">
                {t("cancel")}
              </Button>
              <Button
                variant={canTranslate ? "secondary" : "primary"}
                pending={pending && !canTranslate}
                disabled={pending || !ask || offline}
                onClick={() => change(false)}
                className="flex-1"
              >
                {canTranslate ? t("changeOnly") : t("change")}
              </Button>
            </div>
          </div>
        }
      >
        <div className="flex flex-col gap-3">
          <p>{t("chooseNew")}</p>
          <div role="radiogroup" aria-label={t("chooseNew")} className="grid grid-cols-2 gap-2">
            {others.map((option) => {
              const selected = option.code === ask?.next;
              return (
                <button
                  key={option.code}
                  type="button"
                  role="radio"
                  lang={option.code}
                  aria-checked={selected}
                  disabled={pending || offline}
                  onClick={() => choose(option.code)}
                  className={`flex min-h-12 items-center justify-center gap-2 rounded-xl border px-3 font-medium disabled:opacity-60 ${
                    selected ? "border-accent bg-accent text-accent-foreground" : "border-border bg-surface"
                  }`}
                >
                  {selected && <Check className="size-4" strokeWidth={3} aria-hidden />}
                  {option.native}
                </button>
              );
            })}
          </div>
          {error && <Alert>{tErrors("unknown")}</Alert>}
          {ask && (
            <div className="flex flex-col gap-3" aria-live="polite">
              <h3 className="font-semibold">{t("changeTitle", { lang: nextName })}</h3>
              <p>{t("changeText", { lang: nextName })}</p>
              {ask.next === "en" ? (
                <p className="text-sm text-muted">{t("changeToEnglish")}</p>
              ) : ask.preview.records > 0 ? (
                <>
                  <p>
                    {t("changeTranslate", { count: ask.preview.records, lang: nextName, requests: ask.preview.requests })}
                    {ask.preview.aiLeft !== null && <> {t("changeLeft", { left: ask.preview.aiLeft })}</>}
                  </p>
                  <p className="text-sm text-muted">{t("changeNote")}</p>
                </>
              ) : null}
            </div>
          )}
        </div>
      </Sheet>
    </section>
  );
}
