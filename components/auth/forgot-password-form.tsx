"use client";

import { useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { MailCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import { requestPasswordReset } from "@/app/(auth)/actions";
import { forgotPasswordSchema, type ForgotPasswordInput } from "@/lib/validation/auth";
import { FormAlert, SubmitButton, TextField } from "./fields";

export function ForgotPasswordForm() {
  const t = useTranslations("auth");
  const [formError, setFormError] = useState<string>();
  const [sentTo, setSentTo] = useState<string>();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordInput>({ resolver: zodResolver(forgotPasswordSchema), defaultValues: { email: "" } });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(undefined);
    const result = await requestPasswordReset(values);
    if ("error" in result) setFormError(result.error);
    else setSentTo(values.email.trim());
  });

  const backLink = (
    <Link href="/login" className="inline-block self-center py-2 text-sm font-medium text-accent">
      {t("forgot.backToLogin")}
    </Link>
  );

  if (sentTo) {
    return (
      <div className="flex flex-col items-center gap-3 text-center">
        <MailCheck className="size-12 text-accent" aria-hidden />
        <h2 className="text-xl font-semibold">{t("forgot.sentTitle")}</h2>
        <p className="text-muted">{t("forgot.sent", { email: sentTo })}</p>
        {backLink}
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <p className="text-muted">{t("forgot.intro")}</p>
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
      <SubmitButton pending={isSubmitting}>{t("forgot.submit")}</SubmitButton>
      {backLink}
    </form>
  );
}
