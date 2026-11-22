"use client";

import { useId, useState } from "react";
import type { UseFormReturn } from "react-hook-form";
import { Languages } from "lucide-react";
import { useTranslations } from "next-intl";
import { translateName } from "@/lib/ai/client";
import { useErrorText } from "@/lib/use-error-text";
import { slotLang, type Slot } from "@/lib/data-lang";
import type { NamePairInput } from "@/lib/validation/names";
import { useDataLang } from "./data-lang/context";
import { DictationField } from "./dictation-field";
import { useOffline } from "./offline-banner";
import { useAiOff, usePlanLimitText } from "./plan-context";
import { Button } from "./ui/buttons";

const inputClass =
  "min-h-12 w-full rounded-xl border border-border bg-surface px-4 text-base outline-none focus:border-accent aria-invalid:border-red-500";

/**
 * Name inputs: one field in the user's language (or English), or that + English (English next
 * to it, or a record in another language). With two fields, "Translate" is enabled when exactly
 * one of them is filled: it asks /api/ai/translate and fills the other one (the user still saves).
 * `foreign`: the record is in another language (edited through English).
 */
export function NameFields({ form, max, foreign = false }: { form: UseFormReturn<NamePairInput>; max: number; foreign?: boolean }) {
  const t = useTranslations("common");
  const errorText = useErrorText();
  const id = useId();
  const [translating, setTranslating] = useState(false);
  const [aiError, setAiError] = useState<string>();
  const offline = useOffline();
  const aiOff = useAiOff();
  const limitText = usePlanLimitText();
  const { mode, lang: myLang } = useDataLang();
  const edit: Slot[] = mode === "en" ? ["en"] : mode === "local" && !foreign ? ["local"] : ["local", "en"];
  const both = edit.length === 2;
  const {
    register,
    watch,
    setValue,
    formState: { errors },
  } = form;

  const local = watch("name_local").trim();
  const en = watch("name_en").trim();
  const from: Slot | null = local && !en ? "local" : en && !local ? "en" : null;

  async function translate() {
    if (!from) return;
    setAiError(undefined);
    setTranslating(true);
    const result = await translateName({ text: from === "local" ? local : en, from });
    setTranslating(false);
    if ("error" in result) setAiError(result.error);
    else
      setValue(from === "local" ? "name_en" : "name_local", result.text.slice(0, max), {
        shouldValidate: true,
        shouldDirty: true,
      });
  }

  const fieldError = errorText(errors.name_local?.message ?? errors.name_en?.message);

  return (
    <div className="flex flex-col gap-3">
      {edit.map((slot) => {
        const lang = slotLang(slot, myLang);
        const field = slot === "local" ? "name_local" : "name_en";
        const otherField = slot === "local" ? "name_en" : "name_local";
        const set = (name: "name_local" | "name_en") => (value: string) =>
          setValue(name, value, { shouldValidate: true, shouldDirty: true });
        return (
          <DictationField
            key={slot}
            label={!both ? t("name") : slot === "local" ? t("nameLocal", { lang: lang.toUpperCase() }) : t("nameEn")}
            htmlFor={`${id}-${slot}`}
            slot={slot}
            kind="name"
            max={max}
            getValue={() => form.getValues(field)}
            setValue={set(field)}
            other={
              both
                ? { slot: slot === "local" ? "en" : "local", get: () => form.getValues(otherField), set: set(otherField) }
                : undefined
            }
          >
            <input
              id={`${id}-${slot}`}
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
