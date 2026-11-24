"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { BookOpen, Check, LoaderCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { addBookCover, applyBookFill } from "@/app/(app)/items/book-fill-actions";
import { useDataLang } from "@/components/data-lang/context";
import { useLocations } from "@/components/locations/locations-context";
import { useOffline } from "@/components/offline-banner";
import { Alert, Button } from "@/components/ui/buttons";
import { Sheet } from "@/components/ui/sheet";
import { fetchCoverImage, fillLookup } from "@/lib/books/client";
import { defaultTicks, FILL_FIELDS, type FilledItem, type FillField, type FillProposal } from "@/lib/books/fill-types";
import { formatIsbn } from "@/lib/books/isbn";
import { pickText } from "@/lib/items/types";
import { createLocalStore } from "@/lib/local-store";
import { PHOTO_BUCKET, photoFiles, photoPath, thumbPath } from "@/lib/photos/paths";
import { processPhoto } from "@/lib/photos/process";
import { createClient } from "@/lib/supabase/client";
import { useErrorText } from "@/lib/use-error-text";
import { bumpVersion, offerBookUndo } from "./bulk-bar";

/** Between catalogue requests: stays under the per-minute limit and leaves room for covers. */
const PAUSE_MS = 2_500;
/** A catalogue that did not answer: wait, ask again; after this many times go on with the next book. */
const BUSY_WAIT_MS = 20_000;
const BUSY_TRIES = 3;

// --- The job: kept on the device per user, so it can be closed and continued later. --------------

type Job = {
  /** Still to look up. */
  ids: string[];
  /** Found and waiting for review. */
  found: FillProposal[];
  /** Books of the job, and how many are looked up. */
  total: number;
  done: number;
};

const asJob = (raw: unknown): Job | undefined => {
  const j = raw as Job | null;
  return j && Array.isArray(j.ids) && Array.isArray(j.found) && typeof j.total === "number" && typeof j.done === "number" ? j : undefined;
};

type JobStore = ReturnType<typeof createLocalStore<Job | null>>;
const jobStores = new Map<string, JobStore>();
function jobStoreFor(userId: string): JobStore {
  let store = jobStores.get(userId);
  if (!store) jobStores.set(userId, (store = createLocalStore<Job | null>(`inventory.bookFill.${userId}`, null, asJob)));
  return store;
}

// The sheet is opened from the selection bar, which disappears: a module flag, as for "Undo".
let sheetOpen = false;
const openListeners = new Set<() => void>();
function setSheetOpen(next: boolean) {
  sheetOpen = next;
  openListeners.forEach((l) => l());
}
const useSheetOpen = () =>
  useSyncExternalStore(
    (l) => {
      openListeners.add(l);
      return () => openListeners.delete(l);
    },
    () => sheetOpen,
    () => false,
  );

/** Adds the books to the job (a job that is not finished goes on with them) and opens the screen. */
export function startBookFill(userId: string, ids: string[]) {
  const store = jobStoreFor(userId);
  const old = store.get();
  const known = new Set([...(old?.ids ?? []), ...(old?.found.map((f) => f.id) ?? [])]);
  const fresh = ids.filter((id) => !known.has(id));
  store.set({
    ids: [...(old?.ids ?? []), ...fresh],
    found: old?.found ?? [],
    total: (old?.total ?? 0) + fresh.length,
    done: old?.done ?? 0,
  });
  setSheetOpen(true);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** The screen of the job and, with `card`, the "Continue" card of an unfinished one. */
export function BookFillHost({ card = false }: { card?: boolean }) {
  const t = useTranslations("bookFill");
  const { userId } = useLocations();
  const store = jobStoreFor(userId);
  const job = store.useValue();
  const open = useSheetOpen();
  if (!job) return null;
  return (
    <>
      {card && !open && (
        <div role="status" className="mb-4 flex flex-col gap-2 rounded-2xl border border-accent bg-surface p-3 text-sm">
          <p className="flex items-start gap-2">
            <BookOpen className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />
            {job.ids.length > 0 ? t("cardProgress", { done: job.done, total: job.total }) : t("cardReview", { count: job.found.length })}
          </p>
          <div className="flex gap-2">
            <Button onClick={() => store.set(null)} className="flex-1">
              {t("discard")}
            </Button>
            <Button variant="primary" onClick={() => setSheetOpen(true)} className="flex-1">
              {job.ids.length > 0 ? t("continue") : t("review")}
            </Button>
          </div>
        </div>
      )}
      {open && <BookFillSheet job={job} store={store} userId={userId} />}
    </>
  );
}

type Tick = FillField | "cover";

function BookFillSheet({ job, store, userId }: { job: Job; store: JobStore; userId: string }) {
  const t = useTranslations("bookFill");
  const errorText = useErrorText();
  const offline = useOffline();
  const { display } = useDataLang();
  // Looking up until everything is done or the user goes to the review.
  const [reviewing, setReviewing] = useState(job.ids.length === 0);
  const [waiting, setWaiting] = useState(false);
  const [stopped, setStopped] = useState<string>();
  // Ticks the user changed; the rest are the defaults.
  const [changed, setChanged] = useState<Record<string, Tick[]>>({});
  const [applying, setApplying] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (reviewing) return;
    let alive = true;
    void (async () => {
      let tries = 0;
      let postponed = 0;
      while (alive) {
        const current = store.get();
        if (!current) return;
        // Everything left was asked and got no answer: stop, they wait for "Continue".
        if (current.ids.length === 0 || postponed >= current.ids.length) break;
        const [id, ...rest] = current.ids;
        const r = await fillLookup(id);
        if (!alive) return;
        // The job may have changed or been discarded while the request ran.
        const now = store.get();
        if (!now || now.ids[0] !== id) continue;
        if ("error" in r) return setStopped(r.error);
        if (r.status === "busy") {
          if (++tries < BUSY_TRIES) {
            setWaiting(true);
            await sleep(BUSY_WAIT_MS);
            if (alive) setWaiting(false);
            continue;
          }
          // No answer for this book: to the end of the queue.
          tries = 0;
          postponed++;
          store.set({ ...now, ids: [...rest, id] });
        } else {
          tries = 0;
          store.set({ ...now, ids: rest, done: now.done + 1, found: r.status === "found" ? [...now.found, r.proposal] : now.found });
        }
        await sleep(PAUSE_MS);
      }
      if (alive) setReviewing(true);
    })();
    return () => {
      alive = false;
    };
  }, [reviewing, store]);

  const close = () => {
    if (applying) return;
    const now = store.get();
    // Nothing left to look up or to review: the job is over.
    if (now && now.ids.length === 0 && now.found.length === 0) store.set(null);
    setSheetOpen(false);
  };

  const ticksOf = (p: FillProposal): Tick[] => changed[p.id] ?? defaultTicks(p);
  const available = (p: FillProposal): Tick[] => [...FILL_FIELDS.filter((f) => p.values[f] !== undefined), ...(p.coverIsbn ? (["cover"] as const) : [])];
  const chosen = useMemo(
    () => job.found.map((p) => ({ p, ticks: changed[p.id] ?? defaultTicks(p) })).filter((x) => x.ticks.length > 0),
    [job.found, changed],
  );

  /** The cover is compressed like any photo and uploaded; the server adds it only to a book without photos. */
  async function addCover(p: FillProposal): Promise<string | null> {
    let cover = await fetchCoverImage(p.coverIsbn!);
    for (let i = 0; i < BUSY_TRIES && "error" in cover && cover.error === "rateLimited"; i++) {
      await sleep(BUSY_WAIT_MS);
      cover = await fetchCoverImage(p.coverIsbn!);
    }
    if (!("blob" in cover)) return null;
    const { main, thumb } = await processPhoto(new File([cover.blob], "cover", { type: cover.blob.type }));
    const storage = createClient().storage.from(PHOTO_BUCKET);
    const path = photoPath(userId, p.id, crypto.randomUUID());
    const opts = { contentType: "image/jpeg", upsert: false };
    const [a, b] = await Promise.all([storage.upload(path, main, opts), storage.upload(thumbPath(path), thumb, opts)]);
    if (a.error || b.error) {
      await storage.remove(photoFiles(path));
      return null;
    }
    const r = await addBookCover({ id: p.id, path }).catch(() => null);
    return r?.ok && r.data.added ? path : null;
  }

  async function apply() {
    const covers = chosen.filter((x) => x.ticks.includes("cover"));
    setApplying({ done: 0, total: covers.length });
    setError(undefined);
    const changes = chosen.flatMap(({ p, ticks }) => {
      const values = Object.fromEntries(FILL_FIELDS.filter((f) => ticks.includes(f)).map((f) => [f, p.values[f]])) as FillProposal["values"];
      return Object.keys(values).length ? [{ id: p.id, values }] : [];
    });
    const items = new Map<string, FilledItem>();
    // Long jobs: the server takes up to 500 at a time.
    for (let i = 0; i < changes.length; i += 100) {
      const r = await applyBookFill(changes.slice(i, i + 100)).catch(() => null);
      const result = r ?? ({ ok: false, error: "network" } as const);
      if (!result.ok) {
        setApplying(null);
        setError(errorText(result.error));
        // What was written so far can still be undone; the rest stays for another try.
        finish(items, new Set(changes.slice(0, i).map((c) => c.id)), false);
        return;
      }
      for (const it of result.data.items) items.set(it.id, it);
    }
    for (const [i, { p }] of covers.entries()) {
      const path = await addCover(p).catch(() => null);
      if (path) items.set(p.id, { ...(items.get(p.id) ?? { id: p.id, set: {}, becameBook: false }), cover: path });
      setApplying({ done: i + 1, total: covers.length });
      if (i < covers.length - 1) await sleep(PAUSE_MS);
    }
    setApplying(null);
    finish(items, new Set(job.found.map((p) => p.id)), true);
  }

  /** `reviewed`: books that leave the job (applied, or looked at and left unticked). */
  function finish(items: Map<string, FilledItem>, reviewed: Set<string>, all: boolean) {
    const now = store.get();
    if (now) {
      const found = now.found.filter((p) => !reviewed.has(p.id));
      store.set(found.length || now.ids.length ? { ...now, found } : null);
    }
    if (items.size) offerBookUndo([...items.values()]);
    if (all) setSheetOpen(false);
    bumpVersion();
  }

  const label: Record<Tick, string> = { author: t("author"), year: t("year"), isbn: "ISBN", nameEn: t("nameEn"), cover: t("cover") };
  const shown = (p: FillProposal, f: Tick) => (f === "cover" ? t("coverValue") : f === "isbn" ? formatIsbn(p.values.isbn!) : String(p.values[f]));
  const box = (on: boolean) =>
    `flex size-6 shrink-0 items-center justify-center rounded-md border-2 ${on ? "border-accent bg-accent text-accent-foreground" : "border-border"}`;

  let body: React.ReactNode;
  let footer: React.ReactNode;
  if (!reviewing) {
    const percent = job.total ? Math.round((job.done / job.total) * 100) : 0;
    body = (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted">{t("intro")}</p>
        <div role="progressbar" aria-valuemin={0} aria-valuemax={job.total} aria-valuenow={job.done} className="h-2 overflow-hidden rounded-full bg-surface">
          <div className="h-full bg-accent transition-[width]" style={{ width: `${percent}%` }} />
        </div>
        <p role="status" className="flex items-center gap-2">
          {!stopped && <LoaderCircle className="size-5 shrink-0 animate-spin text-muted" aria-hidden />}
          {t("progress", { done: job.done, total: job.total })}
        </p>
        <p className="text-sm text-muted">{t("foundSoFar", { count: job.found.length })}</p>
        {waiting && <Alert tone="warning">{t("waiting")}</Alert>}
        {stopped && <Alert>{errorText(stopped)}</Alert>}
        <p className="text-sm text-muted">{t("canClose")}</p>
      </div>
    );
    footer = (
      <div className="flex gap-2">
        <Button onClick={close} className="flex-1">
          {t("closeForNow")}
        </Button>
        <Button variant="primary" disabled={job.found.length === 0} onClick={() => setReviewing(true)} className="flex-1">
          {t("reviewFound", { count: job.found.length })}
        </Button>
      </div>
    );
  } else if (job.found.length === 0) {
    body = (
      <div className="flex flex-col gap-3">
        <p>{t("nothingFound")}</p>
        {job.ids.length > 0 && <p className="text-sm text-muted">{t("leftUnanswered", { count: job.ids.length })}</p>}
      </div>
    );
    footer = <Button onClick={close}>{t("close")}</Button>;
  } else {
    body = (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted">{t("reviewIntro")}</p>
        {job.ids.length > 0 && <Alert tone="warning">{t("leftToLookUp", { count: job.ids.length })}</Alert>}
        {error && <Alert>{error}</Alert>}
        <ul className="flex flex-col gap-3">
          {job.found.map((p) => {
            const ticks = ticksOf(p);
            const fields = available(p);
            const all = fields.every((f) => ticks.includes(f));
            const set = (next: Tick[]) => setChanged((c) => ({ ...c, [p.id]: next }));
            return (
              <li key={p.id} data-book={p.id} className="flex flex-col rounded-2xl border border-border p-3 [contain-intrinsic-size:auto_180px] [content-visibility:auto]">
                <div className="flex items-start gap-2">
                  <p className="min-w-0 flex-1 font-medium break-words">
                    {pickText(p.nameLocal, p.nameEn, display)}
                    {p.currentAuthor && <span className="block text-sm font-normal text-muted">{p.currentAuthor}</span>}
                  </p>
                  <button type="button" disabled={!!applying} onClick={() => set(all ? [] : fields)} className="min-h-11 shrink-0 px-1 text-sm font-medium text-accent">
                    {all ? t("untickAll") : t("tickAll")}
                  </button>
                </div>
                {p.source === "isbn" ? (
                  <p className="text-xs text-muted">{t("byIsbn")}</p>
                ) : (
                  <>
                    <p className="text-xs text-amber-700 dark:text-amber-300">{p.exact ? t("byTitle") : t("byTitleUnsure")}</p>
                    <p className="text-xs text-muted">{t("foundAs", { title: [p.foundTitle, p.foundAuthor].filter(Boolean).join(" — ") })}</p>
                  </>
                )}
                {fields.map((f) => {
                  const on = ticks.includes(f);
                  return (
                    <button
                      key={f}
                      type="button"
                      role="checkbox"
                      aria-checked={on}
                      disabled={!!applying}
                      onClick={() => set(on ? ticks.filter((x) => x !== f) : [...ticks, f])}
                      className="flex min-h-11 items-center gap-3 text-left text-sm"
                    >
                      <span className={box(on)}>{on && <Check className="size-4" strokeWidth={3} aria-hidden />}</span>
                      <span className="min-w-0 flex-1 break-words">
                        <span className="text-muted">{label[f]}: — → </span>
                        {shown(p, f)}
                      </span>
                    </button>
                  );
                })}
              </li>
            );
          })}
        </ul>
      </div>
    );
    footer = (
      <div className="flex gap-2">
        {job.ids.length > 0 && !applying ? (
          <Button onClick={() => setReviewing(false)} className="flex-1">
            {t("continueLookup")}
          </Button>
        ) : (
          <Button onClick={close} disabled={!!applying} className="flex-1">
            {t("later")}
          </Button>
        )}
        <Button variant="primary" className="flex-1" pending={!!applying} disabled={chosen.length === 0 || offline} onClick={() => void apply()}>
          {applying && applying.total > 0 ? t("covers", { done: applying.done, total: applying.total }) : t("apply", { count: chosen.length })}
        </Button>
      </div>
    );
  }

  return (
    <Sheet open onClose={close} title={t("title")} footer={footer}>
      {body}
    </Sheet>
  );
}
