"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Check, MailCheck } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { signUp } from "@/app/(auth)/actions";
import { setLocale } from "@/i18n/actions";
import { LANGUAGES, type Lang } from "@/lib/languages";
import { signupSchema, type SignupInput } from "@/lib/validation/auth";
import { FormAlert, PasswordField, SubmitButton, TextField } from "./fields";

/**
 * Sign-up with "My language": nothing is preselected and there is no sign-up without a choice.
 * A choice switches this screen to that language right away (guest cookie) and goes with the
 * sign-up: interface, records and default categories.
 */
export function SignupForm() {
  const t = useTranslations("auth");
  const locale = useLocale();
  const router = useRouter();
  const [switching, startSwitch] = useTransition();
  const [formError, setFormError] = useState<string>();
  const [sentTo, setSentTo] = useState<string>();
  const {
    register,
    handleSubmit,
    setValue,
    control,
    formState: { errors, isSubmitting },
  } = useForm<SignupInput>({
    resolver: zodResolver(signupSchema),
    defaultValues: { email: "", password: "", confirmPassword: "" },
  });

  const chosen = useWatch({ control, name: "lang" });
  const choose = (code: Lang) => {
    setValue("lang", code);
    if (code !== locale)
      startSwitch(async () => {
        await setLocale(code);
        router.refresh();
      });
  };

  const onSubmit = handleSubmit(async (values) => {
    setFormError(undefined);
    const result = await signUp(values);
    if (!result) return;
    if ("error" in result) setFormError(result.error);
    else setSentTo(values.email.trim());
  });

  if (sentTo) {
    return (
      <div className="flex flex-col items-center gap-3 text-center">
        <MailCheck className="size-12 text-accent" aria-hidden />
        <h2 className="text-xl font-semibold">{t("signup.checkEmailTitle")}</h2>
        <p className="text-muted">{t("signup.checkEmail", { email: sentTo })}</p>
        <Link href="/login" className="inline-block py-2 font-medium text-accent">
          {t("forgot.backToLogin")}
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <FormAlert error={formError} />
      <fieldset disabled={switching || isSubmitting} className="rounded-2xl border border-border bg-surface p-4">
        <p className="text-lg font-semibold">{t("signup.myLanguage")}</p>
        <p className="mt-1 text-sm text-muted">{t("signup.myLanguageHint")}</p>
        <div role="radiogroup" aria-label={t("signup.myLanguage")} aria-required className="mt-3 flex flex-col gap-2">
          {LANGUAGES.filter((l) => l.enabled).map((l) => {
            const active = l.code === chosen;
            return (
              <button
                key={l.code}
                type="button"
                role="radio"
                lang={l.code}
                aria-checked={active}
                onClick={() => choose(l.code)}
                className={`flex min-h-14 items-center justify-center gap-2 rounded-xl border px-4 text-lg font-medium transition-colors disabled:opacity-60 ${
                  active ? "border-accent bg-accent text-accent-foreground" : "border-border bg-background"
                }`}
              >
                {active && <Check className="size-5" aria-hidden />}
                {l.native}
              </button>
            );
          })}
        </div>
      </fieldset>
      <TextField
        label={t("email")}
        type="email"
        inputMode="email"
        autoComplete="email"
        autoCapitalize="none"
        error={errors.email?.message}
        {...register("email")}
      />
      <PasswordField
        label={t("password")}
        autoComplete="new-password"
        hint={t("passwordHint")}
        error={errors.password?.message}
        {...register("password")}
      />
      <PasswordField
        label={t("confirmPassword")}
        autoComplete="new-password"
        error={errors.confirmPassword?.message}
        {...register("confirmPassword")}
      />
      <div className="flex flex-col gap-1.5">
        <SubmitButton pending={isSubmitting} disabled={!chosen || switching}>
          {t("signup.submit")}
        </SubmitButton>
        {!chosen && <p className="text-center text-sm text-muted">{t("signup.chooseLanguageFirst")}</p>}
      </div>
      <p className="text-center text-sm text-muted">
        {t("signup.haveAccount")}{" "}
        <Link href="/login" className="inline-block py-2 font-medium text-accent">
          {t("signup.loginLink")}
        </Link>
      </p>
    </form>
  );
}
