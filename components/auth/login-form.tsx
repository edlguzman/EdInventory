"use client";

import { useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { signIn } from "@/app/(auth)/actions";
import { loginSchema, type LoginInput } from "@/lib/validation/auth";
import { FormAlert, PasswordField, SubmitButton, TextField } from "./fields";

export function LoginForm({ next, initialError }: { next?: string; initialError?: string }) {
  const t = useTranslations("auth");
  const [formError, setFormError] = useState(initialError);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({ resolver: zodResolver(loginSchema), defaultValues: { email: "", password: "" } });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(undefined);
    const result = await signIn(values, next);
    if (result && "error" in result) setFormError(result.error);
  });

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
        autoComplete="current-password"
        error={errors.password?.message}
        {...register("password")}
      />
      <Link href="/forgot-password" className="-mt-1 self-end py-2 text-sm text-accent">
        {t("login.forgotLink")}
      </Link>
      <SubmitButton pending={isSubmitting}>{t("login.submit")}</SubmitButton>
      <p className="text-center text-sm text-muted">
        {t("login.noAccount")}{" "}
        <Link href="/signup" className="inline-block py-2 font-medium text-accent">
          {t("login.signupLink")}
        </Link>
      </p>
    </form>
  );
}
