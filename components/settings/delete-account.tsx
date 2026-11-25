"use client";

import { useId, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { deleteAccount, type DeleteAccountError } from "@/app/(app)/settings/account-actions";
import { useOffline } from "@/components/offline-banner";
import { Alert, Button } from "@/components/ui/buttons";

const inputClass =
  "min-h-12 w-full rounded-xl border border-border bg-surface px-4 text-base outline-none focus:border-accent";

/** Own page (/settings/delete-account): everything is deleted for good, after the password and the word. */
export function DeleteAccountForm() {
  const t = useTranslations("account");
  const id = useId();
  const offline = useOffline();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<DeleteAccountError>();
  const [pending, startTransition] = useTransition();
  const word = t("confirmWord");
  const ready = password.length > 0 && confirm.trim().toUpperCase() === word && !offline;

  const submit = () =>
    startTransition(async () => {
      setError(undefined);
      const result = await deleteAccount({ password, confirm });
      // On success the action redirects; a returned value is always an error.
      if (result?.error) setError(result.error);
    });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (ready && !pending) submit();
      }}
      className="flex flex-col gap-4"
    >
      <Alert tone="warning">{t("deleteWarning")}</Alert>
      {error && <Alert>{t(`errors.${error}`)}</Alert>}
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-pw`} className="text-sm font-medium">
          {t("password")}
        </label>
        <input
          id={`${id}-pw`}
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={inputClass}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-confirm`} className="text-sm font-medium">
          {t("confirmLabel", { word })}
        </label>
        <input
          id={`${id}-confirm`}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className={inputClass}
        />
      </div>
      <Button type="submit" variant="danger" disabled={!ready} pending={pending} className="min-h-12">
        {t("deleteForever")}
      </Button>
    </form>
  );
}
