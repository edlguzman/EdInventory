"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { updatePassword } from "@/app/(auth)/actions";
import { resetPasswordSchema, type ResetPasswordInput } from "@/lib/validation/auth";
import { FormAlert, PasswordField, SubmitButton } from "./fields";

export function ResetPasswordForm() {
  const t = useTranslations("auth");
  const [formError, setFormError] = useState<string>();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ResetPasswordInput>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { password: "", confirmPassword: "" },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(undefined);
    const result = await updatePassword(values);
    if (result && "error" in result) setFormError(result.error);
  });

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <p className="text-muted">{t("reset.intro")}</p>
      <FormAlert error={formError} />
      <PasswordField
        label={t("newPassword")}
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
      <SubmitButton pending={isSubmitting}>{t("reset.submit")}</SubmitButton>
    </form>
  );
}
