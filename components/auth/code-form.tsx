"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { verifyCode, type CodeError } from "@/app/(auth)/code-actions";
import { Alert } from "@/components/ui/buttons";
import { SubmitButton } from "./fields";

/** The 6-digit code of an authenticator app. */
export function CodeInput({
  value,
  onChange,
  autoFocus = false,
}: {
  value: string;
  onChange: (v: string) => void;
  autoFocus?: boolean;
}) {
  const t = useTranslations("code");
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {t("code")}
      </label>
      <input
        id={id}
        inputMode="numeric"
        autoComplete="one-time-code"
        autoFocus={autoFocus}
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 6))}
        className="min-h-14 w-full rounded-xl border border-border bg-surface px-4 text-center text-2xl tracking-[0.4em] tabular-nums outline-none focus:border-accent"
      />
    </div>
  );
}

/** The second step: after the code the same address opens as usual. */
export function CodeForm({ intro }: { intro: string }) {
  const t = useTranslations("code");
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState<CodeError>();
  const [pending, startTransition] = useTransition();

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        if (code.length !== 6 || pending) return;
        startTransition(async () => {
          setError(undefined);
          const r = await verifyCode(code);
          if (!r.ok) {
            setError(r.error);
            setCode("");
          } else router.refresh();
        });
      }}
      className="flex flex-col gap-4"
    >
      <p className="text-muted">{intro}</p>
      {error && <Alert>{t(`errors.${error}`)}</Alert>}
      <CodeInput value={code} onChange={setCode} autoFocus />
      <SubmitButton pending={pending} disabled={code.length !== 6}>
        {t("continue")}
      </SubmitButton>
      <p className="text-sm text-muted">{t("lost")}</p>
    </form>
  );
}
