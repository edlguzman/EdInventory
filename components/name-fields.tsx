"use client";

import { useId, useState } from "react";
import type { UseFormReturn } from "react-hook-form";
import { Languages } from "lucide-react";
import { useTranslations } from "next-intl";
import { translateName } from "@/lib/ai/client";
import { useErrorText } from "@/lib/use-error-text";
import type { NamePairInput } from "@/lib/validation/names";
import { useDataLang } from "./data-lang/context";
import { DictationField } from "./dictation-field";
import { useOffline } from "./offline-banner";
import { useAiOff, usePlanLimitText } from "./plan-context";
import { Button } from "./ui/buttons";

const inputClass =
  "min-h-12 w-full rounded-xl border border-border bg-surface px-4 text-base outline-none focus:border-accent aria-invalid:border-red-500";

/**
 * Name inputs for the data language mode: one field (en / ru) or RU + EN (ru_en).
 * In ru_en, "Translate" is enabled when exactly one of them is filled: it asks
 * /api/ai/translate and fills the other one (the user still saves).
 */
export function NameFields({ form, max }: { form: UseFormReturn<NamePairInput>; max: number }) {
  const t = useTranslations("common");
  const errorText = useErrorText();
  const id = useId();
  const [translating, setTranslating] = useState(false);
  const [aiError, setAiError] = useState<string>();
  const offline = useOffline();
  const aiOff = useAiOff();
  const limitText = usePlanLimitText();
  const { edit } = useDataLang();
  const both = edit.length === 2;
  const {
    register,
    watch,
    setValue,
    formState: { errors },
  } = form;

  const ru = watch("name_ru").trim();
  const en = watch("name_en").trim();
  const from = ru && !en ? "ru" : en && !ru ? "en" : null;

  async function translate() {
    if (!from) return;
    setAiError(undefined);
    setTranslating(true);
    const result = await translateName({ text: from === "ru" ? ru : en, from });
    setTranslating(false);
    if ("error" in result) setAiError(result.error);
    else
      setValue(from === "ru" ? "name_en" : "name_ru", result.text.slice(0, max), {
        shouldValidate: true,
        shouldDirty: true,
      });
  }

  const fieldError = errorText(errors.name_ru?.message ?? errors.name_en?.message);

  return (
    <div className="flex flex-col gap-3">
      {edit.map((lang) => {
        const field = lang === "ru" ? "name_ru" : "name_en";
        const otherField = lang === "ru" ? "name_en" : "name_ru";
        const set = (name: "name_ru" | "name_en") => (value: string) =>
          setValue(name, value, { shouldValidate: true, shouldDirty: true });
        return (
          <DictationField
            key={lang}
            label={!both ? t("name") : lang === "ru" ? t("nameRu") : t("nameEn")}
            htmlFor={`${id}-${lang}`}
            lang={lang}
            kind="name"
            max={max}
            getValue={() => form.getValues(field)}
            setValue={set(field)}
            other={
              both
                ? { lang: lang === "ru" ? "en" : "ru", get: () => form.getValues(otherField), set: set(otherField) }
                : undefined
            }
          >
            <input
              id={`${id}-${lang}`}
              lang={lang}
              autoComplete="off"
              maxLength={max}
              aria-invalid={fieldError ? true : undefined}
              className={inputClass}
              {...register(field, { onChange: () => setAiError(undefined) })}
            />
          </DictationField>
        );
      })}
      {both && (
        <Button onClick={translate} disabled={!from || offline || aiOff} title={limitText} pending={translating} className="self-start">
          {!translating && <Languages className="size-5" aria-hidden />}
          {translating ? t("translating") : t("translate")}
        </Button>
      )}
      {fieldError || aiError ? (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {fieldError ?? errorText(aiError)}
        </p>
      ) : (
        both && <p className="text-sm text-muted">{t("nameHint")}</p>
      )}
    </div>
  );
}
