"use client";

import { createContext, use } from "react";
import { planName, type PlanNames } from "@/lib/plan-names";
import { Gauge } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

/** What the client needs to know about the plan: the item limit is reached (admins: never). */
export type PlanState = { names: PlanNames; itemLimit: number | null; atItemLimit: boolean };

const PlanContext = createContext<PlanState | null>(null);

export function PlanProvider({ plan, children }: { plan: PlanState | null; children: React.ReactNode }) {
  return <PlanContext value={plan}>{children}</PlanContext>;
}

/**
 * The plan's item limit is reached: new items and every AI feature are off (the server refuses
 * them too, before Gemini). Typing, browsing, plain search and deleting keep working.
 */
export function useAiOff() {
  return use(PlanContext)?.atItemLimit ?? false;
}

/** "The item limit of the Free plan is reached…" — hint for disabled buttons, or undefined. */
export function usePlanLimitText(): string | undefined {
  const plan = use(PlanContext);
  const locale = useLocale();
  const t = useTranslations("plan");
  if (!plan?.atItemLimit) return undefined;
  return t("limitReached", { plan: planName(plan.names, locale) });
}

/** A bar under the header while the limit is reached (like the offline bar). */
export function PlanLimitBanner() {
  const text = usePlanLimitText();
  if (!text) return null;
  return (
    <p
      role="status"
      className="sticky top-11 z-20 flex items-center justify-center gap-2 bg-amber-100 px-4 py-2 text-center text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200"
    >
      <Gauge className="size-4 shrink-0" aria-hidden />
      {text}
    </p>
  );
}
