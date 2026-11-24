"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { ArrowRightLeft, BookOpen, Check, FolderInput, LoaderCircle, MapPin, Plus, Sparkles, Trash2, Undo2 } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  aiRequestsLeft,
  bulkApplyCategories,
  bulkDelete,
  bulkMove,
  bulkRestore,
  bulkSetCategory,
  type BulkResult,
  type ChangeResult,
} from "@/app/(app)/items/bulk-actions";
import { bookFillTargets, undoBookFill } from "@/app/(app)/items/book-fill-actions";
import { createCategory } from "@/app/(app)/settings/category-actions";
import { useDataLang } from "@/components/data-lang/context";
import { LocationPicker } from "@/components/locations/location-picker";
import { PlaceAssistant } from "@/components/locations/place-assistant";
import { useCurrentLocation, useLocations } from "@/components/locations/locations-context";
import { useOffline } from "@/components/offline-banner";
import { useAiOff, usePlanLimitText } from "@/components/plan-context";
import { Alert, Button } from "@/components/ui/buttons";
import { Sheet } from "@/components/ui/sheet";
import { categorizeItems } from "@/lib/ai/client";
import type { CategorizedItem } from "@/lib/ai/types";
import type { FilledItem } from "@/lib/books/fill-types";
import type { CategoryOption } from "@/lib/items/data";
import { kindCategoryIds } from "@/lib/items/kind-filter";
import { pickText, type ItemSummary } from "@/lib/items/types";
import { useErrorText } from "@/lib/use-error-text";
import { startBookFill } from "./book-fill";
import { forgetLoadedItems } from "./use-more-items";

/** Items per AI request of "Sort into categories" (the route's limit). */
const CATEGORIZE_BATCH = 50;
/** Below this confidence a suggestion starts unticked on the review screen. */
const SURE = 0.6;
const UNDO_MS = 10_000;

// --- "Changed N items · Undo" (10 s). A module store: the list remounts after a change. ---------

type UndoState =
  | { kind: "offer"; n: number; result: ChangeResult }
  | { kind: "books"; n: number; items: FilledItem[] }
  | { kind: "done"; n: number; restored: number }
  | null;
let undoState: UndoState = null;
let undoSeq = 0;
const undoListeners = new Set<() => void>();
function setUndo(next: UndoState) {
  undoState = next;
  undoListeners.forEach((l) => l());
}
const subscribeUndo = (l: () => void) => {
  undoListeners.add(l);
  return () => undoListeners.delete(l);
};

// --- List version: bumped after every bulk change, so the list remounts with fresh pages. -------
let version = 0;
const versionListeners = new Set<() => void>();
export function bumpVersion() {
  forgetLoadedItems();
  version++;
  versionListeners.forEach((l) => l());
}
/** Changes after every bulk change or undo: use it as a `key` of the list. */
export function useBulkVersion() {
  return useSyncExternalStore(
    (l) => {
      versionListeners.add(l);
      return () => versionListeners.delete(l);
    },
    () => version,
    () => 0,
  );
}

function offerUndo(result: ChangeResult) {
  if (result.changed > 0) setUndo({ kind: "offer", n: ++undoSeq, result });
}

/** "Changed N books · Undo" after "Complete book data". */
export function offerBookUndo(items: FilledItem[]) {
  setUndo({ kind: "books", n: ++undoSeq, items });
}

/** The undo bar above the bottom navigation; render it once next to a selectable list. */
export function UndoToast() {
  const t = useTranslations("bulk");
  const tFill = useTranslations("bookFill");
  const errorText = useErrorText();
  const state = useSyncExternalStore(subscribeUndo, () => undoState, () => null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (!state) return;
    const n = state.n;
    const timer = window.setTimeout(() => undoState?.n === n && setUndo(null), state.kind === "done" ? 3000 : UNDO_MS);
    return () => window.clearTimeout(timer);
  }, [state]);

  if (!state) return null;
  const undo = async () => {
    if (state.kind === "done") return;
    setBusy(true);
    setError(undefined);
    const r =
      state.kind === "books"
        ? await undoBookFill(state.items)
        : await bulkRestore({ field: state.result.field, values: state.result.previous });
    setBusy(false);
    if (!r.ok) return setError(errorText(r.error));
    bumpVersion();
    setUndo({ kind: "done", n: ++undoSeq, restored: r.data.restored });
  };

  return (
    <div
      role="status"
      className="fixed inset-x-4 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-50 mx-auto flex max-w-md items-center gap-3 rounded-xl bg-foreground px-4 py-2 text-sm text-background shadow-lg"
    >
      <span className="min-w-0 flex-1">
        {error ??
          (state.kind === "offer"
            ? t("changed", { count: state.result.changed })
            : state.kind === "books"
              ? tFill("changed", { count: state.items.length })
              : t("undone", { count: state.restored }))}
      </span>
      {state.kind !== "done" && (
        <button
          type="button"
          onClick={() => void undo()}
          disabled={busy}
          className="inline-flex min-h-11 shrink-0 items-center gap-1.5 font-semibold disabled:opacity-60"
        >
          {busy ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <Undo2 className="size-4" aria-hidden />}
          {t("undo")}
        </button>
      )}
    </div>
  );
}

// --- The action bar --------------------------------------------------------------------------------

type Dialog = "category" | "move" | "delete" | "categorize" | null;

/**
 * Bottom action bar of selection mode, above the app's bottom navigation: Category, Move,
 * Sort into categories (AI), Delete, and "Complete book data" when there may be books among the
 * selected. `loaded`: the items on screen. `onDone` ends selection mode after a successful action.
 */
export function BulkBar({
  ids,
  loaded,
  categories,
  onDone,
}: {
  ids: string[];
  loaded: ItemSummary[];
  categories: CategoryOption[];
  onDone: () => void;
}) {
  const t = useTranslations("bulk");
  const tFill = useTranslations("bookFill");
  const { userId } = useLocations();
  const errorText = useErrorText();
  const offline = useOffline();
  const aiOff = useAiOff();
  const limitText = usePlanLimitText();
  const here = useCurrentLocation();
  const { path } = useLocations();
  const [dialog, setDialog] = useState<Dialog>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const count = ids.length;
  // Books among the selected ("Select all found" may include items that are not loaded: the server knows).
  const bookCategories = new Set(kindCategoryIds(categories, "book"));
  const loadedById = new Map(loaded.map((i) => [i.id, i]));
  const mayHaveBooks = ids.some((id) => {
    const i = loadedById.get(id);
    return !i || i.kind === "book" || (i.kind === "item" && i.categoryId !== null && bookCategories.has(i.categoryId));
  });

  /** "Complete book data": the books that lack something go to the lookup screen. */
  async function fillBooks() {
    setPending(true);
    setError(undefined);
    const r = await bookFillTargets({ ids }).catch(() => ({ ok: false, error: "network" }) as const);
    setPending(false);
    if (!r.ok) return setError(errorText(r.error));
    if (r.data.ids.length === 0) return setError(r.data.complete > 0 ? tFill("allComplete") : tFill("noBooks"));
    startBookFill(userId, r.data.ids);
    onDone();
  }

  /** Runs a bulk action; success: lists start over, Undo is offered, selection ends. */
  async function run<T>(action: () => Promise<BulkResult<T>>, after?: (data: T) => void) {
    setPending(true);
    setError(undefined);
    const r = await action().catch(() => ({ ok: false, error: "network" }) as const);
    setPending(false);
    if (!r.ok) return setError(errorText(r.error));
    after?.(r.data);
    setDialog(null);
    onDone();
    bumpVersion();
  }

  const move = (locationId: string | null) => void run(() => bulkMove({ ids, locationId }), offerUndo);

  const action = "flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-xl px-1 text-xs font-medium disabled:opacity-40";
  return (
    <>
      {/* Space for the bar, so the last cards can scroll above it. */}
      <div aria-hidden className={mayHaveBooks ? "h-32" : "h-20"} />
      <div className="fixed inset-x-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-30 border-t border-border bg-background/95 backdrop-blur">
        {error && !dialog && (
          <div className="mx-auto max-w-2xl px-3 pt-2">
            <Alert>{error}</Alert>
          </div>
        )}
        {mayHaveBooks && (
          <div className="mx-auto max-w-2xl px-3 pt-2">
            <Button className="w-full text-sm text-accent" pending={pending && !dialog} disabled={offline} onClick={() => void fillBooks()}>
              <BookOpen className="size-5" aria-hidden />
              {tFill("action")}
            </Button>
          </div>
        )}
        <div className="mx-auto grid max-w-2xl grid-cols-4 gap-1 px-2 py-1.5">
          <button type="button" className={action} disabled={!count || offline} onClick={() => setDialog("category")}>
            <FolderInput className="size-5" aria-hidden />
            {t("category")}
          </button>
          <button type="button" className={action} disabled={!count || offline} onClick={() => setDialog("move")}>
            <ArrowRightLeft className="size-5" aria-hidden />
            {t("move")}
          </button>
          <button
            type="button"
            className={`${action} text-accent`}
            disabled={!count || offline || aiOff}
            title={aiOff ? limitText : undefined}
            onClick={() => setDialog("categorize")}
          >
            <Sparkles className="size-5" aria-hidden />
            {t("categorize")}
          </button>
          <button
            type="button"
            className={`${action} text-red-600 dark:text-red-400`}
            disabled={!count || offline}
            onClick={() => setDialog("delete")}
          >
            <Trash2 className="size-5" aria-hidden />
            {t("delete")}
          </button>
        </div>
      </div>

      <CategorySheet
        open={dialog === "category"}
        count={count}
        categories={categories}
        pending={pending}
        error={dialog === "category" ? error : undefined}
        onClose={() => !pending && setDialog(null)}
        onPick={(categoryId) => void run(() => bulkSetCategory({ ids, categoryId }), offerUndo)}
      />

      <LocationPicker
        open={dialog === "move"}
        onClose={() => setDialog(null)}
        title={t("moveTitle", { count })}
        initialId={here?.id ?? null}
        allowRoot
        rootLabel={t("noPlace")}
        onSelect={move}
        extra={
          <div className="flex flex-col gap-2">
            {here && (
              // "I'm here" first: the usual target when tidying up where you stand.
              <Button variant="primary" onClick={() => move(here.id)} pending={pending} className="justify-start text-left">
                <MapPin className="size-5 shrink-0" aria-hidden />
                <span className="min-w-0 truncate">{t("moveHere", { place: path(here) })}</span>
              </Button>
            )}
            {error && dialog === "move" && <Alert>{error}</Alert>}
            <PlaceAssistant mode="move" onPlace={move} />
          </div>
        }
      />

      <Sheet
        open={dialog === "delete"}
        onClose={() => !pending && setDialog(null)}
        title={t("deleteTitle", { count })}
        footer={
          <div className="flex gap-2">
            <Button onClick={() => setDialog(null)} disabled={pending} className="flex-1">
              {t("cancel")}
            </Button>
            <Button variant="danger" pending={pending} className="flex-1" onClick={() => void run(() => bulkDelete({ ids }))}>
              {t("deleteConfirm", { count })}
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-3">
          {error && dialog === "delete" && <Alert>{error}</Alert>}
          <Alert tone="warning">{t("deleteText", { count })}</Alert>
        </div>
      </Sheet>

      {dialog === "categorize" && (
        <CategorizeSheet
          ids={ids}
          categories={categories}
          onClose={() => setDialog(null)}
          onApplied={(result) => {
            offerUndo(result);
            setDialog(null);
            onDone();
            bumpVersion();
          }}
        />
      )}
    </>
  );
}

// --- Category ----------------------------------------------------------------------------------------

function CategorySheet({
  open,
  count,
  categories,
  pending,
  error,
  onClose,
  onPick,
}: {
  open: boolean;
  count: number;
  categories: CategoryOption[];
  pending: boolean;
  error?: string;
  onClose: () => void;
  onPick: (categoryId: string | null) => void;
}) {
  const t = useTranslations("bulk");
  const errorText = useErrorText();
  const { display } = useDataLang();
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string>();
  const row = "flex min-h-12 w-full items-center gap-2 rounded-xl px-3 text-left active:bg-surface disabled:opacity-50";

  /** A new category, named in the language shown (the server keeps what the data mode needs). */
  async function create() {
    const text = name.trim();
    if (!text) return;
    setCreating(true);
    setCreateError(undefined);
    const r = await createCategory(display === "en" ? { name_local: "", name_en: text } : { name_local: text, name_en: "" }).catch(() => null);
    setCreating(false);
    if (!r?.ok) return setCreateError(errorText(r?.error ?? "network"));
    setName("");
    onPick(r.data.id);
  }

  return (
    <Sheet open={open} onClose={onClose} title={t("categoryTitle", { count })}>
      <div className="flex flex-col gap-1">
        {error && <Alert>{error}</Alert>}
        <button type="button" className={`${row} text-muted`} disabled={pending} onClick={() => onPick(null)}>
          {t("noCategory")}
        </button>
        {categories.map((c) => (
          <button key={c.id} type="button" className={row} disabled={pending} onClick={() => onPick(c.id)}>
            {pickText(c.name_local, c.name_en, display)}
          </button>
        ))}
        <div className="mt-2 flex flex-col gap-2 border-t border-border pt-3">
          <label htmlFor="bulk-new-category" className="text-sm font-medium">
            {t("newCategory")}
          </label>
          <div className="flex gap-2">
            <input
              id="bulk-new-category"
              value={name}
              maxLength={100}
              onChange={(e) => setName(e.target.value)}
              className="min-h-12 min-w-0 flex-1 rounded-xl border border-border bg-surface px-3 text-base outline-none focus:border-accent"
            />
            <Button onClick={() => void create()} pending={creating || pending} disabled={!name.trim()}>
              <Plus className="size-5" aria-hidden />
              {t("create")}
            </Button>
          </div>
          {createError && <Alert>{createError}</Alert>}
        </div>
      </div>
    </Sheet>
  );
}

// --- Sort into categories (AI) ------------------------------------------------------------------------

type NewCategory = { key: string; name_local: string; name_en: string };
type Row = { item: CategorizedItem; target: { categoryId: string } | { newKey: string } };
type Stage =
  | { kind: "confirm" }
  | { kind: "running"; done: number; total: number }
  | { kind: "review"; rows: Row[]; newCategories: NewCategory[]; sorted: number; stoppedBy?: string }
  | { kind: "empty"; stoppedBy?: string };

const newKey = (c: { name_local: string; name_en: string }) => (c.name_en || c.name_local).trim().toLowerCase();

/**
 * Confirm ("this takes N AI requests") -> batches of 50 (1 request each) -> review: "item:
 * was -> will be", new categories to create, every row ticked unless the AI was unsure ->
 * Apply (creates the ticked categories, then sets each item's category in one action).
 */
function CategorizeSheet({
  ids,
  categories,
  onClose,
  onApplied,
}: {
  ids: string[];
  categories: CategoryOption[];
  onClose: () => void;
  onApplied: (result: ChangeResult) => void;
}) {
  const t = useTranslations("bulk");
  const errorText = useErrorText();
  const { display, mode } = useDataLang();
  const requests = Math.ceil(ids.length / CATEGORIZE_BATCH);
  const [stage, setStage] = useState<Stage>({ kind: "confirm" });
  const [left, setLeft] = useState<number | null | undefined>(undefined);
  const [checked, setChecked] = useState<Set<string>>(() => new Set());
  const [newChecked, setNewChecked] = useState<Set<string>>(() => new Set());
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string>();

  // How many AI requests are left today (null = no limit), for the confirm step.
  useEffect(() => {
    let alive = true;
    aiRequestsLeft()
      .then((n) => alive && setLeft(n))
      .catch(() => alive && setLeft(null));
    return () => {
      alive = false;
    };
  }, []);

  const categoryName = (id: string | null) => {
    if (!id) return t("noCategory");
    const c = categories.find((x) => x.id === id);
    return c ? pickText(c.name_local, c.name_en, display) : "—";
  };
  const newName = (c: { name_local: string; name_en: string }) => pickText(c.name_local || null, c.name_en || null, display);

  async function start() {
    const batches = Array.from({ length: requests }, (_, i) => ids.slice(i * CATEGORIZE_BATCH, (i + 1) * CATEGORIZE_BATCH));
    const results: CategorizedItem[] = [];
    let stoppedBy: string | undefined;
    for (let i = 0; i < batches.length; i++) {
      setStage({ kind: "running", done: i, total: batches.length });
      const r = await categorizeItems(batches[i]);
      // Daily limit, item limit or a failure: stop, keep what was sorted so far.
      if ("error" in r) {
        stoppedBy = errorText(r.error);
        break;
      }
      results.push(...r.items);
    }

    const news = new Map<string, NewCategory>();
    const rows: Row[] = [];
    for (const item of results) {
      const s = item.suggestion;
      if (!s) continue;
      if (s.newCategory === null) {
        if (s.categoryId === item.currentCategoryId) continue; // unchanged: not shown
        rows.push({ item, target: { categoryId: s.categoryId } });
      } else {
        const created = s.newCategory;
        const key = newKey(created);
        if (!key) continue;
        if (!news.has(key)) news.set(key, { key, name_local: created.name_local, name_en: created.name_en });
        rows.push({ item, target: { newKey: key } });
      }
    }
    if (rows.length === 0) return setStage({ kind: "empty", stoppedBy });
    setChecked(new Set(rows.filter((r) => r.item.confidence >= SURE).map((r) => r.item.id)));
    setNewChecked(new Set(news.keys()));
    setStage({ kind: "review", rows, newCategories: [...news.values()], sorted: results.length, stoppedBy });
  }

  async function apply(rows: Row[], newCategories: NewCategory[]) {
    setApplying(true);
    setError(undefined);
    const chosen = rows.filter((r) => checked.has(r.item.id) && ("categoryId" in r.target || newChecked.has(r.target.newKey)));
    // Create only the new categories that ticked rows need.
    const createdIds = new Map<string, string>();
    for (const c of newCategories) {
      if (!chosen.some((r) => "newKey" in r.target && r.target.newKey === c.key)) continue;
      // The required name of the mode must be there (en: English; otherwise my language, else English).
      const names = mode === "en" ? { name_local: "", name_en: c.name_en || c.name_local } : { name_local: c.name_local || c.name_en, name_en: c.name_en };
      const r = await createCategory(names).catch(() => null);
      if (!r?.ok) {
        setApplying(false);
        return setError(errorText(r?.error ?? "network"));
      }
      createdIds.set(c.key, r.data.id);
    }
    const changes = chosen.map((r) => ({
      id: r.item.id,
      categoryId: "categoryId" in r.target ? r.target.categoryId : (createdIds.get(r.target.newKey) ?? null),
    }));
    const r = await bulkApplyCategories({ changes }).catch(() => ({ ok: false, error: "network" }) as const);
    setApplying(false);
    if (!r.ok) return setError(errorText(r.error));
    onApplied(r.data);
  }

  const busy = stage.kind === "running" || applying;
  const toggle = (set: Set<string>, id: string) => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  };
  const box = (on: boolean) =>
    `flex size-6 shrink-0 items-center justify-center rounded-md border-2 ${on ? "border-accent bg-accent text-accent-foreground" : "border-border"}`;

  let body: React.ReactNode;
  let footer: React.ReactNode = null;
  if (stage.kind === "confirm") {
    const notEnough = left !== null && left !== undefined && left < requests;
    body = (
      <div className="flex flex-col gap-3">
        <p>{t("categorizeIntro", { count: ids.length })}</p>
        <Alert tone="warning">
          {t("categorizeCost", { requests })}{" "}
          {left === undefined ? "…" : left === null ? "" : t("requestsLeft", { left })}
        </Alert>
        {notEnough && <p className="text-sm text-muted">{t("notEnoughRequests")}</p>}
        <p className="text-sm text-muted">{t("categorizePrivacy")}</p>
      </div>
    );
    footer = (
      <div className="flex gap-2">
        <Button onClick={onClose} className="flex-1">
          {t("cancel")}
        </Button>
        <Button variant="primary" className="flex-1" disabled={left === 0} onClick={() => void start()}>
          <Sparkles className="size-5" aria-hidden />
          {t("categorizeStart")}
        </Button>
      </div>
    );
  } else if (stage.kind === "running") {
    body = (
      <p role="status" className="flex items-center gap-2 py-6 text-muted">
        <LoaderCircle className="size-5 animate-spin" aria-hidden />
        {t("categorizeRunning", { done: stage.done + 1, total: stage.total })}
      </p>
    );
  } else if (stage.kind === "empty") {
    body = (
      <div className="flex flex-col gap-3">
        {stage.stoppedBy && <Alert>{stage.stoppedBy}</Alert>}
        <p>{t("categorizeNothing")}</p>
      </div>
    );
    footer = <Button onClick={onClose}>{t("close")}</Button>;
  } else {
    const { rows, newCategories, sorted, stoppedBy } = stage;
    const effective = rows.filter((r) => checked.has(r.item.id) && ("categoryId" in r.target || newChecked.has(r.target.newKey)));
    body = (
      <div className="flex flex-col gap-4">
        {stoppedBy && (
          <Alert>
            {stoppedBy} {t("sortedOf", { done: sorted, total: ids.length })}
          </Alert>
        )}
        {error && <Alert>{error}</Alert>}
        {newCategories.length > 0 && (
          <section className="flex flex-col gap-1 rounded-2xl border border-accent p-3">
            <h3 className="text-sm font-semibold">{t("createNew")}</h3>
            {newCategories.map((c) => (
              <button
                key={c.key}
                type="button"
                role="checkbox"
                aria-checked={newChecked.has(c.key)}
                onClick={() => setNewChecked((s) => toggle(s, c.key))}
                className="flex min-h-11 items-center gap-3 text-left"
              >
                <span className={box(newChecked.has(c.key))}>{newChecked.has(c.key) && <Check className="size-4" strokeWidth={3} />}</span>
                <span className="min-w-0 flex-1">{newName(c)}</span>
              </button>
            ))}
          </section>
        )}
        <ul className="flex flex-col divide-y divide-border">
          {rows.map((r) => {
            const disabled = "newKey" in r.target && !newChecked.has(r.target.newKey);
            const on = checked.has(r.item.id) && !disabled;
            const to =
              "categoryId" in r.target
                ? categoryName(r.target.categoryId)
                : `${newName(newCategories.find((c) => c.key === (r.target as { newKey: string }).newKey)!)} (${t("newMark")})`;
            return (
              <li key={r.item.id}>
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={on}
                  disabled={disabled}
                  onClick={() => setChecked((s) => toggle(s, r.item.id))}
                  className="flex min-h-14 w-full items-center gap-3 py-2 text-left disabled:opacity-50"
                >
                  <span className={box(on)}>{on && <Check className="size-4" strokeWidth={3} />}</span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate font-medium">{pickText(r.item.nameLocal, r.item.nameEn, display)}</span>
                    <span className="text-sm text-muted">
                      {categoryName(r.item.currentCategoryId)} → <span className="text-foreground">{to}</span>
                      {r.item.confidence < SURE && <span className="ml-1 text-amber-700 dark:text-amber-300">· {t("unsure")}</span>}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    );
    footer = (
      <div className="flex gap-2">
        <Button onClick={onClose} disabled={applying} className="flex-1">
          {t("cancel")}
        </Button>
        <Button
          variant="primary"
          className="flex-1"
          pending={applying}
          disabled={effective.length === 0}
          onClick={() => void apply(rows, newCategories)}
        >
          {t("apply", { count: effective.length })}
        </Button>
      </div>
    );
  }

  return (
    <Sheet open onClose={() => !busy && onClose()} title={t("categorizeTitle", { count: ids.length })} footer={footer}>
      {body}
    </Sheet>
  );
}
