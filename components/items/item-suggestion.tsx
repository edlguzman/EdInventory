"use client";

import { Check, Sparkles, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useDataLang } from "@/components/data-lang/context";
import { Button } from "@/components/ui/buttons";
import type { ItemSuggestion } from "@/lib/ai/types";

/**
 * Item details heard in a voice phrase, shown as a suggestion.
 * Nothing changes in the form until the user taps "Accept".
 * Only the fields shown in this mode are listed; with only my language shown, the English
 * text from the same AI answer is accepted along with it (it stays hidden).
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
  const { edit, lang: myLang } = useDataLang();
  const one = edit.length === 1;
  const code = myLang.toUpperCase();
  const rows: [string, string][] = [];
  for (const slot of edit) {
    const name = slot === "local" ? suggestion.name_local : suggestion.name_en;
    const description = slot === "local" ? suggestion.description_local : suggestion.description_en;
    if (name) rows.push([one ? tCommon("name") : slot === "local" ? tCommon("nameLocal", { lang: code }) : tCommon("nameEn"), name]);
    if (description)
      rows.push([
        one ? tItems("description") : slot === "local" ? tItems("descriptionLocal", { lang: code }) : tItems("descriptionEn"),
        description,
      ]);
  }
  const tagsAdd = edit.flatMap((slot) => (slot === "local" ? suggestion.tags_add_local : suggestion.tags_add_en));
  if (tagsAdd.length) rows.push([tItems("tags"), tagsAdd.map((x) => `+ ${x}`).join(", ")]);

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
