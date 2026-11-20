"use client";

import { useState, useTransition } from "react";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { setUserPlan, updatePlan, type AdminActionError } from "@/app/(app)/admin/actions";
import { Alert, Button } from "@/components/ui/buttons";
import type { AdminUser, PlanRow } from "@/lib/admin/data";

const field =
  "min-h-11 w-full min-w-0 rounded-lg border border-border bg-background px-3 text-base outline-none focus:border-accent";

/** Local calendar date (yyyy-mm-dd) of an ISO time, for <input type="date">. */
function toDateInput(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** The end of that local day, as ISO with offset (the plan lasts through the chosen date). */
function fromDateInput(value: string) {
  return value ? new Date(`${value}T23:59:59`).toISOString() : null;
}

export function usePlanName(plans: PlanRow[]) {
  const locale = useLocale();
  return (code: string | null) => {
    const p = plans.find((x) => x.code === code);
    return p ? (locale === "ru" ? p.name_ru : p.name_en) : (code ?? "");
  };
}

/** In a user's card: the effective plan, and the manual plan with an optional end date. */
export function UserPlan({ user, plans, editable }: { user: AdminUser; plans: PlanRow[]; editable: boolean }) {
  const t = useTranslations("admin");
  const format = useFormatter();
  const planName = usePlanName(plans);
  const [plan, setPlan] = useState(user.manual_plan ?? "");
  const [until, setUntil] = useState(toDateInput(user.manual_until));
  const [error, setError] = useState<AdminActionError>();
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();
  const changed = plan !== (user.manual_plan ?? "") || until !== toDateInput(user.manual_until);

  const effective = [
    planName(user.plan_code),
    t(`source.${user.plan_source as "manual" | "subscription" | "default"}`),
    user.plan_until ? t("untilDate", { date: format.dateTime(new Date(user.plan_until), { dateStyle: "medium" }) }) : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="flex flex-col gap-2 rounded-xl bg-surface p-3">
      <p className="text-sm">
        <span className="text-muted">{t("plan")}: </span>
        <span className="font-medium">{effective}</span>
      </p>
      {editable && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1 text-xs text-muted">
              {t("manualPlan")}
              <select value={plan} onChange={(e) => (setPlan(e.target.value), setSaved(false))} className={`${field} text-foreground`}>
                <option value="">{t("planNone")}</option>
                {plans.map((p) => (
                  <option key={p.code} value={p.code}>
                    {planName(p.code)}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted">
              {t("until")}
              <input
                type="date"
                value={until}
                disabled={!plan}
                onChange={(e) => (setUntil(e.target.value), setSaved(false))}
                className={`${field} text-foreground disabled:opacity-50`}
              />
            </label>
          </div>
          {error && <Alert>{t(`errors.${error}`)}</Alert>}
          <div className="flex items-center gap-3">
            <Button
              pending={pending}
              disabled={!changed}
              onClick={() =>
                startTransition(async () => {
                  setError(undefined);
                  const r = await setUserPlan(user.user_id, plan || null, plan ? fromDateInput(until) : null);
                  if (!r.ok) setError(r.error);
                  else setSaved(true);
                })
              }
            >
              {t("savePlan")}
            </Button>
            {saved && !changed && <span className="text-sm text-muted">{t("saved")}</span>}
          </div>
        </>
      )}
    </div>
  );
}

/** "Plans": names, item limit, AI per day, order — edited here, effective at once. */
export function AdminPlans({ plans }: { plans: PlanRow[] }) {
  const t = useTranslations("admin");
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">{t("plans")}</h2>
      <p className="text-sm text-muted">{t("plansIntro")}</p>
      <ul className="flex flex-col gap-3">
        {plans.map((p) => (
          <PlanEditor key={p.code} plan={p} />
        ))}
      </ul>
    </section>
  );
}

function PlanEditor({ plan }: { plan: PlanRow }) {
  const t = useTranslations("admin");
  const [v, setV] = useState({
    name_ru: plan.name_ru,
    name_en: plan.name_en,
    item_limit: plan.item_limit === null ? "" : String(plan.item_limit),
    ai_daily_limit: plan.ai_daily_limit === null ? "" : String(plan.ai_daily_limit),
    sort_order: String(plan.sort_order),
  });
  const [error, setError] = useState<AdminActionError>();
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setV({ ...v, [k]: e.target.value });
    setSaved(false);
  };
  const num = (s: string) => (s.trim() === "" ? null : Number(s));

  const input = (k: keyof typeof v, label: string, numeric = false) => (
    <label className="flex min-w-0 flex-col gap-1 text-xs text-muted">
      {label}
      <input
        value={v[k]}
        onChange={set(k)}
        inputMode={numeric ? "numeric" : undefined}
        placeholder={numeric && k !== "sort_order" ? "∞" : undefined}
        className={`${field} text-foreground`}
      />
    </label>
  );

  return (
    <li className="flex flex-col gap-2 rounded-2xl border border-border p-3">
      <p className="font-mono text-xs text-muted">{plan.code}</p>
      <div className="grid grid-cols-2 gap-2">
        {input("name_ru", t("planNameRu"))}
        {input("name_en", t("planNameEn"))}
      </div>
      <div className="grid grid-cols-3 gap-2">
        {input("item_limit", t("itemLimit"), true)}
        {input("ai_daily_limit", t("aiLimit"), true)}
        {input("sort_order", t("order"), true)}
      </div>
      {error && <Alert>{t(`errors.${error}`)}</Alert>}
      <div className="flex items-center gap-3">
        <Button
          pending={pending}
          onClick={() =>
            startTransition(async () => {
              setError(undefined);
              const r = await updatePlan({
                code: plan.code,
                name_ru: v.name_ru,
                name_en: v.name_en,
                item_limit: num(v.item_limit),
                ai_daily_limit: num(v.ai_daily_limit),
                sort_order: Number(v.sort_order) || 0,
              });
              if (!r.ok) setError(r.error);
              else setSaved(true);
            })
          }
        >
          {t("save")}
        </Button>
        {saved && <span className="text-sm text-muted">{t("saved")}</span>}
      </div>
    </li>
  );
}
