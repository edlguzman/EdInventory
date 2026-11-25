"use client";

import { useState, useTransition } from "react";
import { Ban, Check, ChevronDown, Crown, ShieldCheck, ShieldMinus, ShieldPlus, Trash2 } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { deleteUser, setUserRole, setUserStatus, type AdminActionError } from "@/app/(app)/admin/actions";
import { Alert, Button } from "@/components/ui/buttons";
import { Sheet } from "@/components/ui/sheet";
import type { AdminUser, AiKindUsage, PlanRow } from "@/lib/admin/data";
import { AiKinds, useAmounts, useCost } from "./usage";
import { usePlanName, UserPlan } from "./plan-controls";
import { useTimeZone } from "@/lib/use-time-zone";

const STATUS_STYLE: Record<string, string> = {
  pending: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
  active: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
  disabled: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
};

/** One page of accounts: compact rows that open into a card with the actions. */
export function AdminUserList({
  users,
  selfId,
  isOwner,
  plans,
  filtered,
}: {
  users: AdminUser[];
  plans: PlanRow[];
  selfId: string;
  /** The viewer is the owner: plans and admins can be changed. */
  isOwner: boolean;
  filtered: boolean;
}) {
  const t = useTranslations("admin");
  const tCommon = useTranslations("common");
  const [error, setError] = useState<AdminActionError>();
  const [toDelete, setToDelete] = useState<AdminUser | null>(null);
  const [toRole, setToRole] = useState<AdminUser | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const toggle = (id: string) =>
    setOpen((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const run = (
    userId: string,
    action: () => Promise<{ ok: true } | { ok: false; error: AdminActionError }>,
    onDone?: () => void,
  ) => {
    setBusyId(userId);
    startTransition(async () => {
      setError(undefined);
      const result = await action();
      if (!result.ok) setError(result.error);
      else onDone?.();
      setBusyId(null);
    });
  };

  return (
    <div className="flex flex-col gap-4">
      {error && <Alert>{t(`errors.${error}`)}</Alert>}

      {users.length === 0 ? (
        <p className="py-8 text-center text-muted">{filtered ? t("emptyFiltered") : t("emptyAll")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {users.map((u) => (
            <UserCard
              key={u.user_id}
              user={u}
              isSelf={u.user_id === selfId}
              byOwner={isOwner}
              plans={plans}
              open={open.has(u.user_id)}
              onToggle={() => toggle(u.user_id)}
              busy={pending && busyId === u.user_id}
              disabled={pending}
              onActivate={() => run(u.user_id, () => setUserStatus(u.user_id, "active"))}
              onDisable={() => run(u.user_id, () => setUserStatus(u.user_id, "disabled"))}
              onDelete={() => setToDelete(u)}
              onRole={() => setToRole(u)}
            />
          ))}
        </ul>
      )}

      <Sheet
        open={!!toDelete}
        onClose={() => !pending && setToDelete(null)}
        title={t("deleteTitle")}
        footer={
          <div className="flex gap-2">
            <Button onClick={() => setToDelete(null)} disabled={pending} className="flex-1">
              {tCommon("cancel")}
            </Button>
            <Button
              variant="danger"
              pending={pending}
              className="flex-1"
              onClick={() =>
                toDelete &&
                run(
                  toDelete.user_id,
                  () => deleteUser(toDelete.user_id),
                  () => setToDelete(null),
                )
              }
            >
              {t("deleteForever")}
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-3">
          {error && <Alert>{t(`errors.${error}`)}</Alert>}
          <Alert tone="warning">{t("deleteText", { email: toDelete?.email ?? "" })}</Alert>
        </div>
      </Sheet>

      <Sheet
        open={!!toRole}
        onClose={() => !pending && setToRole(null)}
        title={toRole?.role === "admin" ? t("removeAdminTitle") : t("makeAdminTitle")}
        footer={
          <div className="flex gap-2">
            <Button onClick={() => setToRole(null)} disabled={pending} className="flex-1">
              {tCommon("cancel")}
            </Button>
            <Button
              variant={toRole?.role === "admin" ? "danger" : "primary"}
              pending={pending}
              className="flex-1"
              onClick={() =>
                toRole &&
                run(
                  toRole.user_id,
                  () => setUserRole(toRole.user_id, toRole.role === "admin" ? "user" : "admin"),
                  () => setToRole(null),
                )
              }
            >
              {toRole?.role === "admin" ? t("removeAdmin") : t("makeAdmin")}
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-3">
          {error && <Alert>{t(`errors.${error}`)}</Alert>}
          <p className="break-words">
            {toRole?.role === "admin"
              ? t("removeAdminText", { email: toRole?.email ?? "" })
              : t("makeAdminText", { email: toRole?.email ?? "" })}
          </p>
        </div>
      </Sheet>
    </div>
  );
}

function UserCard({
  user,
  plans,
  open,
  onToggle,
  isSelf,
  byOwner,
  busy,
  disabled,
  onActivate,
  onDisable,
  onDelete,
  onRole,
}: {
  user: AdminUser;
  plans: PlanRow[];
  open: boolean;
  onToggle: () => void;
  isSelf: boolean;
  byOwner: boolean;
  busy: boolean;
  disabled: boolean;
  onActivate: () => void;
  onDisable: () => void;
  onDelete: () => void;
  onRole: () => void;
}) {
  const t = useTranslations("admin");
  const format = useFormatter();
  const timeZone = useTimeZone();
  const planName = usePlanName(plans);
  const { bytes } = useAmounts();
  const cost = useCost()({ cost: user.ai_cost_30d, requests: user.ai_30d, noTokens: user.ai_no_tokens_30d, noPrice: user.ai_no_price_30d });
  const date = (iso: string | null, time = true) =>
    !iso
      ? t("never")
      : timeZone
        ? format.dateTime(
            new Date(iso),
            time ? { dateStyle: "medium", timeStyle: "short", timeZone } : { dateStyle: "medium", timeZone },
          )
        : "…";
  const isAdmin = user.role === "admin";
  const roleName = user.is_owner ? t("ownerRole") : t("adminRole");
  const RoleIcon = user.is_owner ? Crown : ShieldCheck;
  const status = user.status as "pending" | "active" | "disabled";

  return (
    <li className="rounded-2xl border border-border">
      {/* Compact row: email, role, status, plan, items, storage, AI cost; more columns on wide screens. */}
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex min-h-14 w-full items-center gap-2 px-3 py-2 text-left"
      >
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="truncate font-medium">{user.email}</span>
            {isAdmin && <RoleIcon className="size-4 shrink-0 text-accent" aria-label={roleName} />}
          </span>
          <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted">
            <span className={`rounded-full px-1.5 py-px font-medium ${STATUS_STYLE[status] ?? ""}`}>
              {t(`status.${status}`)}
            </span>
            <span>{planName(user.plan_code)}</span>
            <span className="tabular-nums">{t("itemsShort", { count: user.items_count })}</span>
            <span className="tabular-nums">{bytes(user.storage_bytes)}</span>
            <span className="tabular-nums">{t("costShort", { cost: cost.text })}</span>
            <span className="hidden tabular-nums md:inline">{t("aiShort", { count: user.ai_24h })}</span>
            <span className="hidden md:inline">
              {t("registered")}: {date(user.created_at, false)}
            </span>
          </span>
        </span>
        <ChevronDown
          className={`size-5 shrink-0 text-muted transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden
        />
      </button>
      {open && (
        <div className="flex flex-col gap-3 border-t border-border p-3">
          {isAdmin && (
            <span className="inline-flex w-fit items-center gap-1 rounded-full bg-surface px-2 py-0.5 text-xs font-medium text-accent">
              <RoleIcon className="size-3.5" aria-hidden />
              {roleName}
              {isSelf && ` · ${t("you")}`}
            </span>
          )}
          {/* Without the code an admin cannot open the admin screens. */}
          {isAdmin && byOwner && <p className="text-sm text-muted">{user.has_code ? t("codeOn") : t("codeOff")}</p>}
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
            <dt className="text-muted">{t("registered")}</dt>
            <dd>{date(user.created_at)}</dd>
            <dt className="text-muted">{t("lastSignIn")}</dt>
            <dd>{date(user.last_sign_in_at)}</dd>
          </dl>
          <dl className="grid grid-cols-3 gap-2 text-center">
            {(
              [
                ["items", user.items_count],
                ["place", bytes(user.storage_bytes)],
                ["cost30d", cost.text],
                ["ai24h", user.ai_24h],
                ["ai30", user.ai_30d],
                ["aiTotal", user.ai_total],
              ] as const
            ).map(([key, n]) => (
              <div key={key} className="flex flex-col-reverse justify-end rounded-xl bg-surface px-1 py-2">
                <dt className="text-xs text-muted">{t(key)}</dt>
                <dd className="font-semibold whitespace-nowrap tabular-nums">{n}</dd>
              </div>
            ))}
          </dl>
          <AiKinds kinds={user.ai_kinds_30d as AiKindUsage[]} />
          {cost.notes.length > 0 && <p className="text-xs text-muted">{cost.notes.join(" ")}</p>}

          <UserPlan user={user} plans={plans} editable={byOwner && !user.is_owner} />

          {!isAdmin && (
            <div className="flex flex-wrap gap-2">
              {status !== "active" && (
                <Button variant="primary" pending={busy} disabled={disabled} onClick={onActivate} className="flex-1">
                  <Check className="size-5" aria-hidden />
                  {t("activate")}
                </Button>
              )}
              {status !== "disabled" && (
                <Button pending={busy} disabled={disabled} onClick={onDisable} className="flex-1">
                  <Ban className="size-5" aria-hidden />
                  {t("disable")}
                </Button>
              )}
              <Button
                disabled={disabled}
                onClick={onDelete}
                className="flex-1 text-red-600 dark:text-red-400"
                aria-label={`${t("delete")}: ${user.email}`}
              >
                <Trash2 className="size-5" aria-hidden />
                {t("delete")}
              </Button>
            </div>
          )}
          {byOwner && !user.is_owner && (isAdmin || status === "active") && (
            <Button disabled={disabled} onClick={onRole}>
              {isAdmin ? <ShieldMinus className="size-5" aria-hidden /> : <ShieldPlus className="size-5" aria-hidden />}
              {isAdmin ? t("removeAdmin") : t("makeAdmin")}
            </Button>
          )}
        </div>
      )}
    </li>
  );
}
