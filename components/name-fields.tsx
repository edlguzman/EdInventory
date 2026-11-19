"use client";

import { useId, useState } from "react";
import type { UseFormReturn } from "react-hook-form";
import { Languages } from "lucide-react";
import { useTranslations } from "next-intl";
import { translateName } from "@/lib/ai/client";
import { useErrorText } from "@/lib/use-error-text";
import type { NamePairInput } from "@/lib/validation/names";
import { useOffline } from "./offline-banner";
import { Button } from "./ui/buttons";

const inputClass =
  "min-h-12 w-full rounded-xl border border-border bg-surface px-4 text-base outline-none focus:border-accent aria-invalid:border-red-500";

/**
 * RU + EN name inputs. "Translate" is enabled when exactly one of them is filled:
 * it asks /api/ai/translate and fills the other one (the user still saves).
 */
export function NameFields({ form, max }: { form: UseFormReturn<NamePairInput>; max: number }) {
  const t = useTranslations("common");
  const errorText = useErrorText();
  const id = useId();
  const [translating, setTranslating] = useState(false);
  const [aiError, setAiError] = useState<string>();
  const offline = useOffline();
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
    else setValue(from === "ru" ? "name_en" : "name_ru", result.text.slice(0, max), { shouldValidate: true, shouldDirty: true });
  }

  const fieldError = errorText(errors.name_ru?.message ?? errors.name_en?.message);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-ru`} className="text-sm font-medium">
          {t("nameRu")}
        </label>
        <input
          id={`${id}-ru`}
          lang="ru"
          autoComplete="off"
          maxLength={max}
          aria-invalid={fieldError ? true : undefined}
          className={inputClass}
          {...register("name_ru", { onChange: () => setAiError(undefined) })}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-en`} className="text-sm font-medium">
          {t("nameEn")}
        </label>
        <input
          id={`${id}-en`}
          lang="en"
          autoComplete="off"
          maxLength={max}
          aria-invalid={fieldError ? true : undefined}
          className={inputClass}
          {...register("name_en", { onChange: () => setAiError(undefined) })}
        />
      </div>
      <Button onClick={translate} disabled={!from || offline} pending={translating} className="self-start">
        {!translating && <Languages className="size-5" aria-hidden />}
        {translating ? t("translating") : t("translate")}
      </Button>
      {fieldError || aiError ? (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {fieldError ?? errorText(aiError)}
        </p>
      ) : (
        <p className="text-sm text-muted">{t("nameHint")}</p>
      )}
    </div>
  );
}
