"use client";

import { useId, useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { deleteAccount } from "@/app/(app)/settings/account-actions";
import { Alert, Button } from "@/components/ui/buttons";
import { Sheet } from "@/components/ui/sheet";

const inputClass =
  "min-h-12 w-full rounded-xl border border-border bg-surface px-4 text-base outline-none focus:border-accent";

export function DeleteAccount() {
  const t = useTranslations("account");
  const tCommon = useTranslations("common");
  const id = useId();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();
  const word = t("confirmWord");
  const ready = password.length > 0 && confirm.trim().toUpperCase() === word;

  const submit = () =>
    startTransition(async () => {
      setError(undefined);
      const result = await deleteAccount({ password, confirm });
      // On success the action redirects; a returned value is always an error.
      if (result?.error) setError(result.error);
    });

  return (
    <>
      <Button onClick={() => setOpen(true)} className="w-full text-red-600 dark:text-red-400">
        <Trash2 className="size-5" aria-hidden />
        {t("delete")}
      </Button>
      <Sheet
        open={open}
        onClose={() => !pending && setOpen(false)}
        title={t("deleteTitle")}
        footer={
          <div className="flex gap-2">
            <Button onClick={() => setOpen(false)} disabled={pending} className="flex-1">
              {tCommon("cancel")}
            </Button>
            <Button variant="danger" onClick={submit} disabled={!ready} pending={pending} className="flex-1">
              {t("deleteForever")}
            </Button>
          </div>
        }
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (ready) submit();
          }}
          className="flex flex-col gap-4"
        >
          <Alert tone="warning">{t("deleteWarning")}</Alert>
          {error && <Alert>{t(`errors.${error as "wrongPassword"}`)}</Alert>}
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
        </form>
      </Sheet>
    </>
  );
}
