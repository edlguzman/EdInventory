"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, KeyRound } from "lucide-react";
import { useTranslations } from "next-intl";
import { confirmCode, disableCode, startCode, type CodeError, type CodeSetup } from "@/app/(auth)/code-actions";
import { CodeInput } from "@/components/auth/code-form";
import { useOffline } from "@/components/offline-banner";
import { Alert, Button } from "@/components/ui/buttons";
import { Sheet } from "@/components/ui/sheet";

type Setup = Extract<CodeSetup, { ok: true }>;

/** "Sign-in with a code" (TOTP): on with a QR code and the first code, off with a code. */
export function CodeSettings({ on, forAdmin }: { on: boolean; forAdmin: boolean }) {
  const t = useTranslations("code");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const offline = useOffline();
  const [open, setOpen] = useState(false);
  const [setup, setSetup] = useState<Setup | null>(null);
  const [code, setCode] = useState("");
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<CodeError>();
  const [pending, startTransition] = useTransition();

  const openWindow = () => {
    setCode("");
    setError(undefined);
    setCopied(false);
    setSetup(null);
    setOpen(true);
    if (on) return;
    startTransition(async () => {
      const r = await startCode();
      if (r.ok) setSetup(r);
      else setError(r.error);
    });
  };

  const submit = () => {
    if (code.length !== 6 || pending || (!on && !setup)) return;
    startTransition(async () => {
      setError(undefined);
      const r = on ? await disableCode(code) : await confirmCode(setup!.factorId, code);
      if (!r.ok) {
        setError(r.error);
        setCode("");
        return;
      }
      setOpen(false);
      router.refresh();
    });
  };

  return (
    <div id="code" className="flex scroll-mt-20 flex-col gap-2 rounded-xl border border-border px-4 py-3">
      <div className="flex items-center gap-3">
        <KeyRound className="size-5 shrink-0 text-accent" aria-hidden />
        <p className="min-w-0 flex-1 font-medium">{t("title")}</p>
        <span className={`text-sm font-medium ${on ? "text-emerald-700 dark:text-emerald-300" : "text-muted"}`}>
          {on ? t("on") : t("off")}
        </span>
      </div>
      <p className="text-sm text-muted">{forAdmin ? t("hintAdmin") : t("hint")}</p>
      <Button onClick={openWindow} disabled={offline}>
        {on ? t("disable") : t("enable")}
      </Button>

      <Sheet
        open={open}
        onClose={() => !pending && setOpen(false)}
        title={on ? t("disableTitle") : t("enableTitle")}
        footer={
          <div className="flex gap-2">
            <Button onClick={() => setOpen(false)} disabled={pending} className="flex-1">
              {tCommon("cancel")}
            </Button>
            <Button
              variant={on ? "danger" : "primary"}
              pending={pending && (on || !!setup)}
              disabled={code.length !== 6 || offline || (!on && !setup)}
              onClick={submit}
              className="flex-1"
            >
              {on ? t("turnOff") : t("turnOn")}
            </Button>
          </div>
        }
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
          className="flex flex-col gap-4"
        >
          {on ? (
            <p>{forAdmin ? t("disableTextAdmin") : t("disableText")}</p>
          ) : setup ? (
            <>
              <p>{t("step1")}</p>
              {/* White in the dark theme too: scanners need dark modules on light. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={setup.qr} alt={t("qrAlt")} width={200} height={200} className="mx-auto size-50 rounded-xl bg-white p-2" />
              <p className="text-sm text-muted">{t("samePhone")}</p>
              <div className="flex flex-col gap-2">
                <p className="rounded-xl bg-surface px-3 py-2 text-center font-mono text-sm break-all select-all">{setup.secret}</p>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    onClick={() =>
                      navigator.clipboard.writeText(setup.secret).then(
                        () => setCopied(true),
                        () => setCopied(false),
                      )
                    }
                  >
                    {copied ? <Check className="size-5" aria-hidden /> : <Copy className="size-5" aria-hidden />}
                    {copied ? t("copied") : t("copy")}
                  </Button>
                  <a
                    href={setup.uri}
                    className="inline-flex min-h-11 items-center justify-center rounded-xl border border-border bg-surface px-3 text-center font-medium"
                  >
                    {t("openApp")}
                  </a>
                </div>
              </div>
              <Alert tone="warning">{t("saveKey")}</Alert>
              <p>{t("step2")}</p>
            </>
          ) : (
            !error && <p className="py-6 text-center text-muted">{t("loading")}</p>
          )}
          {error && <Alert>{t(`errors.${error}`)}</Alert>}
          {(on || setup) && <CodeInput value={code} onChange={setCode} />}
          {!on && setup && <p className="text-sm text-muted">{t("otherDevices")}</p>}
        </form>
      </Sheet>
    </div>
  );
}
