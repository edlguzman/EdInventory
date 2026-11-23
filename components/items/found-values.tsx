"use client";

import { ScanText } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/buttons";

/** A value read from a photo that differs from what the field already holds. */
export type FoundValue = { key: string; label: string; value: string; apply: () => void };

/**
 * "Found on the photo: … · Replace" for fields that already had a value (filled or corrected
 * by the user). Nothing changes until "Replace" is tapped; "Keep mine" dismisses everything.
 */
export function FoundValuesCard({ items, onDone, onDismiss }: { items: FoundValue[]; onDone: (key: string) => void; onDismiss: () => void }) {
  const t = useTranslations("found");
  if (items.length === 0) return null;
  return (
    <div role="status" className="flex flex-col gap-2 rounded-2xl border border-accent bg-surface p-3">
      <p className="flex items-start gap-2 text-sm font-medium">
        <ScanText className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />
        {t("title")}
      </p>
      <ul className="flex flex-col gap-1">
        {items.map((f) => (
          <li key={f.key} className="flex items-center gap-2">
            <p className="min-w-0 flex-1 text-sm">
              <span className="text-muted">{f.label}: </span>
              <span className="break-words">{f.value}</span>
            </p>
            <Button
              variant="ghost"
              className="shrink-0 text-sm"
              onClick={() => {
                f.apply();
                onDone(f.key);
              }}
            >
              {t("replace")}
            </Button>
          </li>
        ))}
      </ul>
      <Button onClick={onDismiss} className="self-start text-sm">
        {t("keep")}
      </Button>
    </div>
  );
}
