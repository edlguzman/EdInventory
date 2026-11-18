"use client";

import { useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { MailCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import { signUp } from "@/app/(auth)/actions";
import { signupSchema, type SignupInput } from "@/lib/validation/auth";
import { FormAlert, PasswordField, SubmitButton, TextField } from "./fields";

export function SignupForm() {
  const t = useTranslations("auth");
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
