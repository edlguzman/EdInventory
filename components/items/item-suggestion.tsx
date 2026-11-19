"use client";

import { Check, Sparkles, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/buttons";
import type { ItemSuggestion } from "@/lib/ai/types";

/**
 * Item details heard in a voice phrase, shown as a suggestion.
 * Nothing changes in the form until the user taps "Accept".
 */
export function ItemSuggestionCard({
  suggestion,
  onAccept,
  onDecline,
}: {
  suggestion: ItemSuggestion;
  onAccept: () => void;
  onDecline: () => void;
}) {
  const t = useTranslations("voice");
  const tItems = useTranslations("items");
  const tCommon = useTranslations("common");
  const rows: [string, string][] = [];
  if (suggestion.name_ru) rows.push([tCommon("nameRu"), suggestion.name_ru]);
  if (suggestion.name_en) rows.push([tCommon("nameEn"), suggestion.name_en]);
  if (suggestion.description_ru) rows.push([tItems("descriptionRu"), suggestion.description_ru]);
  if (suggestion.description_en) rows.push([tItems("descriptionEn"), suggestion.description_en]);
  if (suggestion.tags_add.length) rows.push([tItems("tags"), suggestion.tags_add.map((x) => `+ ${x}`).join(", ")]);

  return (
    <section aria-label={t("suggestionTitle")} className="flex flex-col gap-3 rounded-xl border border-accent/40 bg-surface p-3">
      <p className="flex items-center gap-2 text-sm font-medium">
        <Sparkles className="size-4 text-accent" aria-hidden />
        {t("suggestionTitle")}
      </p>
      <dl className="flex flex-col gap-2 text-sm">
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt className="text-muted">{label}</dt>
            <dd className="whitespace-pre-line">{value}</dd>
          </div>
        ))}
      </dl>
      <div className="flex gap-2">
        <Button onClick={onDecline} className="flex-1">
          <X className="size-4" aria-hidden />
          {t("decline")}
        </Button>
        <Button variant="primary" onClick={onAccept} className="flex-1">
          <Check className="size-4" aria-hidden />
          {t("accept")}
        </Button>
      </div>
    </section>
  );
}
