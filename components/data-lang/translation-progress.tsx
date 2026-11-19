"use client";

import { Check, Languages, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useErrorText } from "@/lib/use-error-text";
import { useDataLang } from "./context";

/** Progress of the pack translation under the header; hidden for the silent catch-up. */
export function TranslationProgress() {
  const t = useTranslations("dataLang");
  const errorText = useErrorText();
  const { job, stopTranslation, dismissJob } = useDataLang();
  if (!job || job.silent) return null;

  const percent = job.total > 0 ? Math.round((job.done / job.total) * 100) : 0;
  const finished = !job.running;

  return (
    <div role="status" className="mx-auto w-full max-w-2xl px-4 pt-3">
      <div className="flex flex-col gap-2 rounded-xl border border-border bg-surface px-4 py-3">
        <div className="flex items-center gap-2 text-sm">
          {finished && !job.error ? (
            <Check className="size-4 shrink-0 text-emerald-600" aria-hidden />
          ) : (
            <Languages className="size-4 shrink-0 text-accent" aria-hidden />
          )}
          <span className="min-w-0 flex-1">
            {job.error
              ? `${t("progressStopped", { done: job.done, total: job.total })} ${errorText(job.error)}`
              : finished
                ? t("progressDone", { done: job.done })
                : t("progress", { done: job.done, total: job.total })}
          </span>
          {finished ? (
            <button
              type="button"
              onClick={dismissJob}
              aria-label={t("close")}
              className="-my-2 -mr-2 flex size-11 shrink-0 items-center justify-center rounded-xl text-muted"
            >
              <X className="size-5" aria-hidden />
            </button>
          ) : (
            <button type="button" onClick={stopTranslation} className="-my-2 min-h-11 shrink-0 px-2 font-medium text-accent">
              {t("stop")}
            </button>
          )}
        </div>
        {!finished && (
          <div
            className="h-1.5 overflow-hidden rounded-full bg-border"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={job.total}
            aria-valuenow={job.done}
            aria-label={t("progressLabel")}
          >
            <div className="h-full rounded-full bg-accent transition-[width]" style={{ width: `${percent}%` }} />
          </div>
        )}
      </div>
    </div>
  );
}
