import { HelpButton } from "@/components/help/help-sheet";
import { planName } from "@/lib/plan-names";
import { Gauge, Sparkles } from "lucide-react";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import type { MyPlan } from "@/lib/plans";

/** Share of the item limit from which Settings warns that it is almost used up. */
const WARN_AT = 0.9;

/** Settings: "Plan: Free · 45 of 200 items", AI requests in 24 h, warnings near and at the limit. */
export async function PlanCard({ plan }: { plan: MyPlan }) {
  const [t, locale, format] = await Promise.all([getTranslations("plan"), getLocale(), getFormatter()]);
  const name = planName(plan.names, locale, plan.code);
  const limit = plan.isAdmin ? null : plan.itemLimit;
  const share = limit ? Math.min(1, plan.itemsCount / limit) : 0;
  const left = limit === null ? null : Math.max(0, limit - plan.itemsCount);
  const aiLimit = plan.isAdmin ? null : plan.aiDailyLimit;
  const until = plan.until ? format.dateTime(new Date(plan.until), { dateStyle: "medium" }) : null;
  const source = plan.isAdmin
    ? t("sourceAdmin")
    : plan.source === "manual"
      ? until
        ? t("sourceManualUntil", { date: until })
        : t("sourceManual")
      : plan.source === "subscription"
        ? t("sourceSubscription", { date: until ?? "" })
        : null;

  return (
    <section className="flex flex-col gap-3">
      <h2 className="flex items-center gap-1 text-sm font-medium text-muted">
        {t("title")}
        <HelpButton topic="plan" small />
      </h2>
      <div className="flex flex-col gap-3 rounded-xl border border-border px-4 py-3">
        <div>
          <p className="flex items-center gap-2">
            <Gauge className="size-5 shrink-0 text-accent" aria-hidden />
            <span className="font-semibold">{t("planName", { plan: name })}</span>
          </p>
          {source && <p className="pl-7 text-sm text-muted">{source}</p>}
        </div>

        <div className="flex flex-col gap-1.5">
          <p className="text-sm">
            {limit === null ? t("itemsUnlimited", { count: plan.itemsCount }) : t("items", { count: plan.itemsCount, limit })}
          </p>
          {limit !== null && (
            <div
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={limit}
              aria-valuenow={plan.itemsCount}
              aria-label={t("items", { count: plan.itemsCount, limit })}
              className="h-2 overflow-hidden rounded-full bg-border"
            >
              <div
                className={`h-full rounded-full ${share >= 1 ? "bg-red-600" : share >= WARN_AT ? "bg-amber-500" : "bg-accent"}`}
                style={{ width: `${Math.round(share * 100)}%` }}
              />
            </div>
          )}
        </div>

        <p className="flex items-center gap-2 text-sm">
          <Sparkles className="size-4 shrink-0 text-muted" aria-hidden />
          {aiLimit === null ? t("aiUnlimited", { used: plan.aiUsed24h }) : t("ai", { used: plan.aiUsed24h, limit: aiLimit })}
        </p>

        {plan.atItemLimit ? (
          <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
            {t("limitReached", { plan: name })}
          </p>
        ) : (
          left !== null &&
          share >= WARN_AT && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-200">
              {t("nearLimit", { left })}
            </p>
          )
        )}
        {!plan.isAdmin && <p className="text-xs text-muted">{t("howToChange")}</p>}
      </div>
    </section>
  );
}
