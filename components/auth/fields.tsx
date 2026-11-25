"use client";

import { useId, useState, type ComponentProps } from "react";
import { useTranslations } from "next-intl";
import { Eye, EyeOff, LoaderCircle } from "lucide-react";
import { isAuthErrorKey } from "@/lib/auth-errors";

type InputProps = ComponentProps<"input"> & {
  label: string;
  /** Error key from zod or the server (AuthErrorKey); translated here. */
  error?: string;
  hint?: string;
};

const inputClass =
  "min-h-12 w-full rounded-xl border bg-surface px-4 text-base outline-none transition-colors focus:border-accent aria-invalid:border-red-500";

function useErrorText(error?: string) {
  const t = useTranslations("auth.errors");
  if (!error) return undefined;
  return t(isAuthErrorKey(error) ? error : "unknown");
}

function FieldShell({
  id,
  label,
  hint,
  errorText,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  errorText?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      {children}
      {errorText ? (
        <p id={`${id}-msg`} className="text-sm text-red-600 dark:text-red-400">
          {errorText}
        </p>
      ) : hint ? (
        <p id={`${id}-msg`} className="text-sm text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function TextField({ label, error, hint, className, ...props }: InputProps) {
  const id = useId();
  const errorText = useErrorText(error);
  return (
    <FieldShell id={id} label={label} hint={hint} errorText={errorText}>
      <input
        id={id}
        aria-invalid={errorText ? true : undefined}
        aria-describedby={errorText || hint ? `${id}-msg` : undefined}
        className={`${inputClass} border-border ${className ?? ""}`}
        {...props}
      />
    </FieldShell>
  );
}

export function PasswordField({ label, error, hint, className, ...props }: InputProps) {
  const id = useId();
  const t = useTranslations("auth");
  const errorText = useErrorText(error);
  const [visible, setVisible] = useState(false);
  return (
    <FieldShell id={id} label={label} hint={hint} errorText={errorText}>
      <div className="relative">
        <input
          id={id}
          type={visible ? "text" : "password"}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          aria-invalid={errorText ? true : undefined}
          aria-describedby={errorText || hint ? `${id}-msg` : undefined}
          className={`${inputClass} border-border pr-12 ${className ?? ""}`}
          {...props}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? t("hidePassword") : t("showPassword")}
          aria-pressed={visible}
          className="absolute inset-y-0 right-0 flex w-12 items-center justify-center text-muted"
        >
          {visible ? <EyeOff className="size-5" aria-hidden /> : <Eye className="size-5" aria-hidden />}
        </button>
      </div>
    </FieldShell>
  );
}

export function FormAlert({ error }: { error?: string }) {
  const text = useErrorText(error);
  if (!text) return null;
  return (
    <p role="alert" className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
      {text}
    </p>
  );
}

export function SubmitButton({
  pending,
  disabled = false,
  children,
}: {
  pending: boolean;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="submit"
      disabled={pending || disabled}
      aria-busy={pending}
      className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-accent px-4 font-semibold text-accent-foreground transition-opacity active:opacity-90 disabled:opacity-60"
    >
      {pending && <LoaderCircle className="size-5 animate-spin" aria-hidden />}
      {children}
    </button>
  );
}
