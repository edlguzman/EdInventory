"use client";

import { useState, useTransition } from "react";
import { Check, MapPin, Plus } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { createLocationChain } from "@/app/(app)/locations/actions";
import { VoiceInput } from "@/components/voice-input";
import { Alert, Button } from "@/components/ui/buttons";
import { askPlace } from "@/lib/ai/client";
import type { ItemContext, ItemSuggestion, PlaceMode, PlaceResult } from "@/lib/ai/types";
import { useErrorText } from "@/lib/use-error-text";
import { useCurrentLocation, useLocations } from "./locations-context";

/**
 * "Where did you put it?" by voice or text (/api/ai/place).
 * - match: the place is chosen right away (visible, can be changed);
 * - create: asks "Create … inside …?" and creates only after "Yes";
 * - ambiguous: asks which of the places;
 * - in the item form, details about the item come back as a suggestion (onItemSuggestion).
 */
export function PlaceAssistant({
  mode,
  getItemContext,
  onPlace,
  onItemSuggestion,
}: {
  mode: PlaceMode;
  getItemContext?: () => ItemContext;
  onPlace: (id: string) => void;
  onItemSuggestion?: (s: ItemSuggestion) => void;
}) {
  const t = useTranslations("voice");
  const errorText = useErrorText();
  const locale = useLocale();
  const { byId, path } = useLocations();
  const here = useCurrentLocation();
  const [busy, setBusy] = useState(false);
  const [creating, startCreate] = useTransition();
  const [error, setError] = useState<string>();
  const [result, setResult] = useState<PlaceResult | null>(null);
  const [chosen, setChosen] = useState<string | null>(null);

  async function submit(input: { audio?: Blob; text?: string }) {
    setError(undefined);
    setResult(null);
    setChosen(null);
    setBusy(true);
    const r = await askPlace({
      ...input,
      mode,
      currentLocationId: here?.id ?? null,
      item: mode === "form" ? getItemContext?.() : null,
    });
    setBusy(false);
    if ("error" in r) return setError(r.error);
    setResult(r);
    if (r.item && onItemSuggestion) onItemSuggestion(r.item);
    if (r.match) {
      setChosen(r.match);
      onPlace(r.match);
    } else if (!r.create && r.ambiguous.length === 0 && !r.item) {
      setError("aiNoPlace");
    }
  }

  const pick = (id: string) => {
    setChosen(id);
    setResult((r) => (r ? { ...r, ambiguous: [], create: null, match: id } : r));
    onPlace(id);
  };

  const create = () =>
    startCreate(async () => {
      if (!result?.create) return;
      const r = await createLocationChain(result.create);
      if (!r.ok) return setError(r.error);
      pick(r.data.id);
    });

  const parent = result?.create?.parent_id ? byId.get(result.create.parent_id) : undefined;
  const newPath = result?.create?.names.map((n) => (locale === "en" ? n.name_en : n.name_ru)).join(" → ");

  return (
    <div className="flex flex-col gap-2">
      <VoiceInput
        label={t("placeLabel")}
        placeholder={t("placePlaceholder")}
        busy={busy}
        onSubmit={submit}
        onError={setError}
      />
      {error && <Alert tone={error === "aiNoPlace" ? "warning" : "error"}>{errorText(error)}</Alert>}
      {result?.transcript && (
        <p className="text-sm text-muted">
          {t("heard")} <q className="text-foreground">{result.transcript}</q>
        </p>
      )}

      {chosen && byId.get(chosen) && (
        <p role="status" className="flex items-start gap-2 rounded-xl bg-surface px-3 py-2 text-sm">
          <Check className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />
          <span>
            {t("placeSet")} <strong className="font-medium">{path(byId.get(chosen)!)}</strong>
          </span>
        </p>
      )}

      {result && !chosen && result.create && (
        <div className="flex flex-col gap-2 rounded-xl border border-accent/40 bg-surface p-3">
          <p className="text-sm">
            {parent
              ? t.rich("createInside", { names: newPath ?? "", parent: path(parent), b: (c) => <strong className="font-medium">{c}</strong> })
              : t.rich("createTop", { names: newPath ?? "", b: (c) => <strong className="font-medium">{c}</strong> })}
          </p>
          <div className="flex gap-2">
            <Button onClick={() => setResult({ ...result, create: null })} className="flex-1">
              {t("no")}
            </Button>
            <Button variant="primary" onClick={create} pending={creating} className="flex-1">
              <Plus className="size-4" aria-hidden />
              {t("create")}
            </Button>
          </div>
        </div>
      )}

      {result && !chosen && result.ambiguous.length > 1 && (
        <div className="flex flex-col gap-1 rounded-xl border border-border p-2">
          <p className="px-1 text-sm font-medium">{t("whichPlace")}</p>
          {result.ambiguous.map((id) => {
            const loc = byId.get(id);
            return loc ? (
              <button
                key={id}
                type="button"
                onClick={() => pick(id)}
                className="flex min-h-11 items-center gap-2 rounded-lg px-2 text-left active:bg-surface"
              >
                <MapPin className="size-4 shrink-0 text-muted" aria-hidden />
                <span className="text-sm">{path(loc)}</span>
              </button>
            ) : null;
          })}
        </div>
      )}
    </div>
  );
}
