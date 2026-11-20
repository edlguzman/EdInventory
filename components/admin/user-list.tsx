"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Ban, Check, ShieldCheck, Trash2 } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { deleteUser, setUserStatus, type AdminActionError } from "@/app/(app)/admin/actions";
import { Alert, Button } from "@/components/ui/buttons";
import { Sheet } from "@/components/ui/sheet";
import type { AdminUser, PlanRow } from "@/lib/admin/data";
import { UserPlan } from "./plan-controls";
import { useTimeZone } from "@/lib/use-time-zone";

const STATUS_STYLE: Record<string, string> = {
  pending: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
  active: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
  disabled: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
};

export function AdminUserList({
  users,
  filter,
  pendingCount,
  totalCount,
  selfId,
  plans,
}: {
  users: AdminUser[];
  plans: PlanRow[];
  filter: "pending" | "all";
  pendingCount: number;
  totalCount: number;
  selfId: string;
}) {
  const t = useTranslations("admin");
  const tCommon = useTranslations("common");
  const [error, setError] = useState<AdminActionError>();
  const [toDelete, setToDelete] = useState<AdminUser | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const run = (userId: string, action: () => Promise<{ ok: true } | { ok: false; error: AdminActionError }>, onDone?: () => void) => {
    setBusyId(userId);
    startTransition(async () => {
      setError(undefined);
      const result = await action();
      if (!result.ok) setError(result.error);
      else onDone?.();
      setBusyId(null);
    });
  };

  const tabClass = (active: boolean) =>
    `flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-lg px-3 text-sm font-medium ${
      active ? "bg-background shadow-sm" : "text-muted"
    }`;

  return (
    <div className="flex flex-col gap-4">
      <nav className="flex gap-1 rounded-xl bg-surface p-1" aria-label={t("title")}>
        <Link href="/admin?show=pending" className={tabClass(filter === "pending")} aria-current={filter === "pending" ? "page" : undefined}>
          {t("pendingTab")}
          {pendingCount > 0 && (
            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-xs font-semibold text-white">
              {pendingCount}
            </span>
          )}
        </Link>
        <Link href="/admin?show=all" className={tabClass(filter === "all")} aria-current={filter === "all" ? "page" : undefined}>
          {t("all")} <span className="text-muted">{totalCount}</span>
        </Link>
      </nav>

      {error && <Alert>{t(`errors.${error}`)}</Alert>}

      {users.length === 0 ? (
        <p className="py-8 text-center text-muted">{filter === "pending" ? t("empty") : t("emptyAll")}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {users.map((u) => (
            <UserCard
              key={u.user_id}
              user={u}
              isSelf={u.user_id === selfId}
              plans={plans}
              busy={pending && busyId === u.user_id}
              disabled={pending}
              onActivate={() => run(u.user_id, () => setUserStatus(u.user_id, "active"))}
              onDisable={() => run(u.user_id, () => setUserStatus(u.user_id, "disabled"))}
              onDelete={() => setToDelete(u)}
            />
          ))}
        </ul>
      )}

      <p className="text-sm text-muted">{t("privacy")}</p>

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
              onClick={() => toDelete && run(toDelete.user_id, () => deleteUser(toDelete.user_id), () => setToDelete(null))}
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
    </div>
  );
}

function UserCard({
  user,
  plans,
  isSelf,
  busy,
  disabled,
  onActivate,
  onDisable,
  onDelete,
}: {
  user: AdminUser;
  plans: PlanRow[];
  isSelf: boolean;
  busy: boolean;
  disabled: boolean;
  onActivate: () => void;
  onDisable: () => void;
  onDelete: () => void;
}) {
  const t = useTranslations("admin");
  const format = useFormatter();
  const timeZone = useTimeZone();
  const date = (iso: string | null) =>
    !iso ? t("never") : timeZone ? format.dateTime(new Date(iso), { dateStyle: "medium", timeStyle: "short", timeZone }) : "…";
  const isAdmin = user.role === "admin";
  const status = user.status as "pending" | "active" | "disabled";

  return (
    <li className="flex flex-col gap-3 rounded-2xl border border-border p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="min-w-0 flex-1 break-all font-medium">{user.email}</span>
        {isAdmin && (
          <span className="inline-flex items-center gap-1 rounded-full bg-surface px-2 py-0.5 text-xs font-medium text-accent">
            <ShieldCheck className="size-3.5" aria-hidden />
            {t("adminRole")}
            {isSelf && ` · ${t("you")}`}
          </span>
        )}
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[status] ?? ""}`}>
          {t(`status.${status}`)}
        </span>
      </div>

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
            ["ai24h", user.ai_24h],
            ["aiTotal", user.ai_total],
          ] as const
        ).map(([key, n]) => (
          <div key={key} className="flex flex-col-reverse rounded-xl bg-surface px-2 py-2">
            <dt className="text-xs text-muted">{t(key)}</dt>
            <dd className="text-lg font-semibold tabular-nums">{n}</dd>
          </div>
        ))}
      </dl>

      <UserPlan user={user} plans={plans} editable={!isAdmin} />

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
          <Button disabled={disabled} onClick={onDelete} className="flex-1 text-red-600 dark:text-red-400" aria-label={`${t("delete")}: ${user.email}`}>
            <Trash2 className="size-5" aria-hidden />
            {t("delete")}
          </Button>
        </div>
      )}
    </li>
  );
}
