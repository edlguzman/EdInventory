"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Camera, Home, MapPin, Mic, Package, Search, Sparkles, Warehouse, Building2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { createLocation } from "@/app/(app)/locations/actions";
import { setCurrentLocationId } from "@/components/locations/locations-context";
import { Alert, Button } from "@/components/ui/buttons";
import { completeOnboarding } from "@/lib/onboarding/actions";
import { useErrorText } from "@/lib/use-error-text";

type Step = "place" | "here" | "how";

const PRESETS = [
  { key: "apartment", icon: Building2, ru: "Квартира", en: "Apartment" },
  { key: "house", icon: Home, ru: "Дом", en: "House" },
  { key: "dacha", icon: Warehouse, ru: "Дача", en: "Country house" },
] as const;

/**
 * First-run tour (no places, no items, not onboarded yet): create the first place,
 * make it "I'm here", learn how to add and find items. Every step can be skipped.
 * It keeps its own open state, so it does not vanish when the first place appears.
 */
export function Onboarding({ initialOpen }: { initialOpen: boolean }) {
  const t = useTranslations("onboarding");
  const errorText = useErrorText();
  const router = useRouter();
  const [open, setOpen] = useState(initialOpen);
  const [step, setStep] = useState<Step>("place");
  const [placeId, setPlaceId] = useState<string | null>(null);
  const [custom, setCustom] = useState("");
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  if (!open) return null;

  const finish = (goTo?: string) =>
    startTransition(async () => {
      await completeOnboarding();
      setOpen(false);
      if (goTo) router.push(goTo);
    });

  const create = (name_ru: string, name_en: string) =>
    startTransition(async () => {
      setError(undefined);
      const result = await createLocation({ name_ru, name_en, parent_id: null });
      if (!result.ok) return setError(result.error);
      setPlaceId(result.data.id);
      setStep("here");
    });

  const steps: Step[] = ["place", "here", "how"];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-title"
      className="fixed inset-0 z-50 flex flex-col overflow-y-auto bg-background px-4 pt-[max(1.5rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))]"
    >
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6">
        <div className="flex items-center justify-between">
          <div className="flex gap-1.5" aria-label={t("progress", { n: steps.indexOf(step) + 1, total: steps.length })}>
            {steps.map((s) => (
              <span key={s} className={`h-1.5 w-8 rounded-full ${s === step ? "bg-accent" : "bg-border"}`} aria-hidden />
            ))}
          </div>
          <button type="button" onClick={() => finish()} disabled={pending} className="min-h-11 px-2 text-sm text-muted">
            {t("skip")}
          </button>
        </div>

        {step === "place" && (
          <div className="flex flex-col gap-4">
            <span className="flex size-14 items-center justify-center rounded-2xl bg-accent text-accent-foreground">
              <Package className="size-7" aria-hidden />
            </span>
            <h1 id="onboarding-title" className="text-2xl font-semibold tracking-tight">
              {t("welcome")}
            </h1>
            <p className="text-muted">{t("placeIntro")}</p>
            {error && <Alert>{errorText(error)}</Alert>}
            <div className="grid grid-cols-3 gap-2">
              {PRESETS.map(({ key, icon: Icon, ru, en }) => (
                <button
                  key={key}
                  type="button"
                  disabled={pending}
                  onClick={() => create(ru, en)}
                  className="flex min-h-20 flex-col items-center justify-center gap-1.5 rounded-xl border border-border bg-surface px-2 text-sm font-medium disabled:opacity-50"
                >
                  <Icon className="size-6 text-accent" aria-hidden />
                  {t(`presets.${key}`)}
                </button>
              ))}
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const name = custom.trim();
                if (name) create(name, name);
              }}
              className="flex gap-2"
            >
              <input
                value={custom}
                onChange={(e) => setCustom(e.target.value)}
                maxLength={200}
                placeholder={t("customPlaceholder")}
                aria-label={t("customPlaceholder")}
                className="min-h-12 min-w-0 flex-1 rounded-xl border border-border bg-surface px-4 text-base outline-none focus:border-accent"
              />
              <Button type="submit" variant="primary" disabled={!custom.trim()} pending={pending}>
                {t("create")}
              </Button>
            </form>
          </div>
        )}

        {step === "here" && (
          <div className="flex flex-col gap-4">
            <span className="flex size-14 items-center justify-center rounded-2xl bg-accent text-accent-foreground">
              <MapPin className="size-7" aria-hidden />
            </span>
            <h1 id="onboarding-title" className="text-2xl font-semibold tracking-tight">
              {t("hereTitle")}
            </h1>
            <p className="text-muted">{t("hereIntro")}</p>
            <Button
              variant="primary"
              className="w-full"
              onClick={() => {
                if (placeId) setCurrentLocationId(placeId);
                setStep("how");
              }}
            >
              {t("hereYes")}
            </Button>
            <Button className="w-full" onClick={() => setStep("how")}>
              {t("hereNo")}
            </Button>
          </div>
        )}

        {step === "how" && (
          <div className="flex flex-col gap-4">
            <h1 id="onboarding-title" className="text-2xl font-semibold tracking-tight">
              {t("howTitle")}
            </h1>
            <ul className="flex flex-col gap-4">
              {(
                [
                  [Camera, "howPhoto"],
                  [Sparkles, "howAi"],
                  [Mic, "howVoice"],
                  [Search, "howSearch"],
                ] as const
              ).map(([Icon, key]) => (
                <li key={key} className="flex gap-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-surface text-accent">
                    <Icon className="size-5" aria-hidden />
                  </span>
                  <p className="pt-2">{t(key)}</p>
                </li>
              ))}
            </ul>
            <div className="mt-2 flex flex-col gap-2">
              <Button variant="primary" className="w-full" pending={pending} onClick={() => finish("/add")}>
                <Camera className="size-5" aria-hidden />
                {t("addFirst")}
              </Button>
              <Button className="w-full" disabled={pending} onClick={() => finish()}>
                {t("later")}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
