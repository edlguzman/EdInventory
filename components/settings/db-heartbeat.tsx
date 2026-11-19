"use client";

import { Activity } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useTimeZone } from "@/lib/use-time-zone";

/**
 * "Last database check: …" in the viewer's own time zone. The server (Vercel) runs in UTC,
 * so the time is formatted only in the browser; the server render shows a placeholder.
 */
export function DbHeartbeat({ at, stale }: { at: string | null; stale: boolean }) {
  const t = useTranslations("settings");
  const format = useFormatter();
  const timeZone = useTimeZone();
  const date = at ? new Date(at) : null;

  return (
    <p className="flex items-start gap-2 text-sm text-muted">
      <Activity className={`mt-0.5 size-4 shrink-0 ${stale ? "text-amber-500" : "text-emerald-500"}`} aria-hidden />
      <span>
        {t("lastDbCheck")}{" "}
        <span className="text-foreground">
          {!date ? t("never") : timeZone ? format.dateTime(date, { dateStyle: "medium", timeStyle: "short", timeZone }) : "…"}
        </span>
      </span>
    </p>
  );
}
