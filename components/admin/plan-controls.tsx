"use client";

import { useState, useTransition } from "react";
import { LANGUAGES } from "@/lib/languages";
import { planName, toPlanNames, type PlanNames } from "@/lib/plan-names";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import {
  createPlan,
  deletePlan,
  reorderPlans,
  setUserPlan,
  updatePlan,
  type AdminActionError,
} from "@/app/(app)/admin/actions";
import { Alert, Button } from "@/components/ui/buttons";
import type { AdminUser, PlanRow, PlanWithStats } from "@/lib/admin/data";

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
    return p ? planName(p.names, locale, p.code) : (code ?? "");
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

/** "Plans": names, limits, order, users per plan; add and delete. Every change takes effect at once. */
export function AdminPlans({ plans }: { plans: PlanWithStats[] }) {
  const t = useTranslations("admin");
  const [error, setError] = useState<AdminActionError>();
  const [pending, startTransition] = useTransition();

  // Move one plan up or down: the whole new order in one call.
  const move = (index: number, delta: -1 | 1) =>
    startTransition(async () => {
      const codes = plans.map((p) => p.code);
      [codes[index], codes[index + delta]] = [codes[index + delta], codes[index]];
      setError(undefined);
      const r = await reorderPlans(codes);
      if (!r.ok) setError(r.error);
    });

  return (
    <section className="flex flex-col gap-3">
      <p className="text-sm text-muted">{t("plansIntro")}</p>
      {error && <Alert>{t(`errors.${error}`)}</Alert>}
      <ul className="flex flex-col gap-3">
        {plans.map((p, i) => (
          <PlanEditor
            key={p.code}
            plan={p}
            reordering={pending}
            onUp={i > 0 ? () => move(i, -1) : undefined}
            onDown={i < plans.length - 1 ? () => move(i, 1) : undefined}
          />
        ))}
      </ul>
      <NewPlan />
    </section>
  );
}

type PlanValues = { names: PlanNames; item_limit: string; ai_daily_limit: string };
const num = (s: string) => (s.trim() === "" ? null : Number(s));

/** Names and limits inputs, shared by an existing plan and a new one. */
function PlanFields({ v, onChange }: { v: PlanValues; onChange: (v: PlanValues) => void }) {
  const t = useTranslations("admin");
  const input = (k: "item_limit" | "ai_daily_limit", label: string, numeric = false) => (
    <label className="flex min-w-0 flex-col gap-1 text-xs text-muted">
      {label}
      <input
        value={v[k]}
        onChange={(e) => onChange({ ...v, [k]: e.target.value })}
        inputMode={numeric ? "numeric" : undefined}
        placeholder={numeric ? "∞" : undefined}
        maxLength={numeric ? 7 : 50}
        className={`${field} text-foreground`}
      />
    </label>
  );
  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        {LANGUAGES.filter((l) => l.enabled).map((l) => (
          <label key={l.code} className="flex min-w-0 flex-col gap-1 text-xs text-muted">
            {t("planName", { lang: l.native })}
            <input
              lang={l.code}
              value={v.names[l.code] ?? ""}
              onChange={(e) => onChange({ ...v, names: { ...v.names, [l.code]: e.target.value } })}
              maxLength={50}
              className={`${field} text-foreground`}
            />
          </label>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2">
        {input("item_limit", t("itemLimit"), true)}
        {input("ai_daily_limit", t("aiLimit"), true)}
      </div>
    </>
  );
}

function PlanEditor({
  plan,
  reordering,
  onUp,
  onDown,
}: {
  plan: PlanWithStats;
  reordering: boolean;
  onUp?: () => void;
  onDown?: () => void;
}) {
  const t = useTranslations("admin");
  const tCommon = useTranslations("common");
  const [v, setV] = useState<PlanValues>({
    names: toPlanNames(plan.names),
    item_limit: plan.item_limit === null ? "" : String(plan.item_limit),
    ai_daily_limit: plan.ai_daily_limit === null ? "" : String(plan.ai_daily_limit),
  });
  const [error, setError] = useState<AdminActionError>();
  const [saved, setSaved] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pending, startTransition] = useTransition();
  // "free" is everyone's fallback; a plan anyone is linked to (manual or subscription) stays.
  const deleteBlocked =
    plan.code === "free"
      ? t("deleteDefault")
      : plan.users_linked > 0
        ? t("deleteInUse", { count: plan.users_linked })
        : null;
  const arrow = "flex size-11 items-center justify-center rounded-xl border border-border disabled:opacity-30";

  const run = (action: () => Promise<{ ok: true } | { ok: false; error: AdminActionError }>, onDone?: () => void) =>
    startTransition(async () => {
      setError(undefined);
      const r = await action();
      if (!r.ok) setError(r.error);
      else onDone?.();
    });

  return (
    <li className="flex flex-col gap-2 rounded-2xl border border-border p-3">
      <div className="flex items-center gap-2">
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="font-mono text-xs text-muted">{plan.code}</span>
          <span className="text-sm">{t("planUsers", { count: plan.users_now })}</span>
        </div>
        <button type="button" onClick={onUp} disabled={!onUp || reordering} aria-label={t("moveUp")} className={arrow}>
          <ArrowUp className="size-5" aria-hidden />
        </button>
        <button
          type="button"
          onClick={onDown}
          disabled={!onDown || reordering}
          aria-label={t("moveDown")}
          className={arrow}
        >
          <ArrowDown className="size-5" aria-hidden />
        </button>
      </div>
      <PlanFields v={v} onChange={(next) => (setV(next), setSaved(false))} />
      {error && <Alert>{t(`errors.${error}`)}</Alert>}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          pending={pending && !confirmDelete}
          disabled={pending}
          onClick={() =>
            run(
              () =>
                updatePlan({
                  code: plan.code,
                  names: v.names,
                  item_limit: num(v.item_limit),
                  ai_daily_limit: num(v.ai_daily_limit),
                  sort_order: plan.sort_order,
                }),
              () => setSaved(true),
            )
          }
        >
          {t("save")}
        </Button>
        {saved && <span className="text-sm text-muted">{t("saved")}</span>}
        <span className="flex-1" />
        {confirmDelete ? (
          <>
            <Button onClick={() => setConfirmDelete(false)} disabled={pending}>
              {tCommon("cancel")}
            </Button>
            <Button variant="danger" pending={pending} onClick={() => run(() => deletePlan(plan.code))}>
              {t("deletePlanConfirm")}
            </Button>
          </>
        ) : (
          <Button
            onClick={() => setConfirmDelete(true)}
            disabled={!!deleteBlocked || pending}
            className="text-red-600 dark:text-red-400"
            aria-label={`${t("delete")}: ${plan.code}`}
          >
            <Trash2 className="size-5" aria-hidden />
            {t("delete")}
          </Button>
        )}
      </div>
      {deleteBlocked && <p className="text-xs text-muted">{deleteBlocked}</p>}
    </li>
  );
}

const EMPTY: PlanValues = { names: {}, item_limit: "", ai_daily_limit: "" };

/** "Add a plan": a code (permanent) plus names and limits; it goes last. */
function NewPlan() {
  const t = useTranslations("admin");
  const tCommon = useTranslations("common");
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [v, setV] = useState<PlanValues>(EMPTY);
  const [error, setError] = useState<AdminActionError>();
  const [pending, startTransition] = useTransition();
  const close = () => {
    setOpen(false);
    setCode("");
    setV(EMPTY);
    setError(undefined);
  };

  if (!open)
    return (
      <Button onClick={() => setOpen(true)}>
        <Plus className="size-5" aria-hidden />
        {t("addPlan")}
      </Button>
    );

  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-accent p-3">
      <h2 className="font-semibold">{t("newPlan")}</h2>
      <label className="flex min-w-0 flex-col gap-1 text-xs text-muted">
        {t("planCode")}
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
          maxLength={32}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          className={`${field} font-mono text-foreground`}
        />
        <span>{t("planCodeHint")}</span>
      </label>
      <PlanFields v={v} onChange={setV} />
      {error && <Alert>{t(`errors.${error}`)}</Alert>}
      <div className="flex gap-2">
        <Button onClick={close} disabled={pending} className="flex-1">
          {tCommon("cancel")}
        </Button>
        <Button
          variant="primary"
          pending={pending}
          disabled={!code || !v.names.en?.trim()}
          className="flex-1"
          onClick={() =>
            startTransition(async () => {
              setError(undefined);
              const r = await createPlan({
                code,
                names: v.names,
                item_limit: num(v.item_limit),
                ai_daily_limit: num(v.ai_daily_limit),
              });
              if (!r.ok) setError(r.error);
              else close();
            })
          }
        >
          {t("addPlan")}
        </Button>
      </div>
    </div>
  );
}
