"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { MailCheck } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { signUp } from "@/app/(auth)/actions";
import { setLocale } from "@/i18n/actions";
import { LANGUAGES } from "@/lib/languages";
import { signupSchema, type SignupInput } from "@/lib/validation/auth";
import { FormAlert, PasswordField, SubmitButton, TextField } from "./fields";

/**
 * Sign-up with "My language": the three buttons switch this screen to that language right
 * away (cookie) and the choice goes with the sign-up: interface, records and default categories.
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
    formState: { errors, isSubmitting },
  } = useForm<SignupInput>({
    resolver: zodResolver(signupSchema),
    defaultValues: { email: "", password: "", confirmPassword: "" },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(undefined);
    const result = await signUp({ ...values, lang: locale });
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
      <fieldset disabled={switching || isSubmitting} className="flex flex-col gap-1.5">
        <legend className="mb-1.5 text-sm font-medium">{t("signup.myLanguage")}</legend>
        <div role="radiogroup" aria-label={t("signup.myLanguage")} className="grid grid-cols-3 gap-2">
          {LANGUAGES.filter((l) => l.enabled).map((l) => {
            const active = l.code === locale;
            return (
              <button
                key={l.code}
                type="button"
                role="radio"
                lang={l.code}
                aria-checked={active}
                onClick={() =>
                  !active &&
                  startSwitch(async () => {
                    await setLocale(l.code);
                    router.refresh();
                  })
                }
                className={`min-h-11 rounded-xl border px-2 text-sm font-medium transition-colors disabled:opacity-60 ${
                  active ? "border-accent bg-accent text-accent-foreground" : "border-border bg-surface"
                }`}
              >
                {l.native}
              </button>
            );
          })}
        </div>
        <span className="text-xs text-muted">{t("signup.myLanguageHint")}</span>
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
      <SubmitButton pending={isSubmitting}>{t("signup.submit")}</SubmitButton>
      <p className="text-center text-sm text-muted">
        {t("signup.haveAccount")}{" "}
        <Link href="/login" className="inline-block py-2 font-medium text-accent">
          {t("signup.loginLink")}
        </Link>
      </p>
    </form>
  );
}
