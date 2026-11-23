"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { BookOpen, Camera, Check, ChevronRight, ImagePlus, LoaderCircle, Pill, ScanSearch, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useHelpTopic } from "@/components/help/help-sheet";
import { createItemsBatch } from "@/app/(app)/items/actions";
import { useDataLang } from "@/components/data-lang/context";
import { LocationPicker } from "@/components/locations/location-picker";
import { PlaceAssistant } from "@/components/locations/place-assistant";
import { useHerePlace, useLocations } from "@/components/locations/locations-context";
import { useOffline } from "@/components/offline-banner";
import { StickyActions } from "@/components/ui/sticky-actions";
import { Alert, Button } from "@/components/ui/buttons";
import { Photo } from "@/components/ui/photo";
import { Sheet } from "@/components/ui/sheet";
import { recognizeItems } from "@/lib/ai/client";
import type { DetectedItem } from "@/lib/ai/types";
import { hasRequiredName } from "@/lib/data-lang";
import type { CategoryOption } from "@/lib/items/data";
import { PHOTO_BUCKET, photoFiles, photoPath, thumbPath } from "@/lib/photos/paths";
import { openPhoto, UnsupportedImageError, type ProcessedPhoto } from "@/lib/photos/process";
import { createClient } from "@/lib/supabase/client";
import { useErrorText } from "@/lib/use-error-text";
import { ITEM_NAME_MAX } from "@/lib/validation/items";
import { findPhotoUses, findSimilarItems, type ExistingItem } from "@/app/(app)/items/duplicate-actions";
import { setBackOverride } from "@/lib/nav-history";
import { fileHash } from "@/lib/photos/hash";
import { BooksCategoryCard, useBooksCategory } from "./books";
import { ExpiryBadge, MedicineCategoryCard } from "./medicine";
import { medicineCategoryId, type MedSubtype } from "@/lib/medicines/attrs";
import { inputFromSuggestion } from "@/lib/medicines/merge";
import type { MedicineSuggestion } from "@/lib/ai/types";
import { PhotoUsedNotice, SimilarNote } from "./duplicate-notice";
import type { ItemSeed } from "./item-form";

type Found = {
  key: string;
  ai: DetectedItem;
  crop: ProcessedPhoto;
  preview: string;
  selected: boolean;
  /** The user ticked or unticked it: the duplicate check no longer changes the tick. */
  touched: boolean;
  name_local: string;
  name_en: string;
  category_id: string | null;
};

type Stage =
  | { kind: "pick" }
  | { kind: "working"; step: "processing" | "detecting" | "cutting" }
  | { kind: "review" }
  | { kind: "used"; items: ExistingItem[] }
  | { kind: "done"; count: number; skipped: number; locationId: string | null };

const fieldClass =
  "w-full min-w-0 rounded-lg border border-border bg-background px-3 py-2 text-base outline-none focus:border-accent aria-invalid:border-red-500";

/** Runs `tasks` with at most `limit` at a time. Resolves to false as soon as one fails. */
async function runPool(tasks: (() => Promise<boolean>)[], limit: number) {
  let next = 0;
  let ok = true;
  const worker = async () => {
    while (ok && next < tasks.length) if (!(await tasks[next++]())) ok = false;
  };
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker));
  return ok;
}

/**
 * "Several items in one photo": one photo of a shelf or a tool board -> Gemini finds the
 * items with their boxes (1 AI request) -> each item is cut out on the device -> the user
 * checks the list, picks one place for all and saves the chosen ones as separate items.
 * Primary photo = the cut-out, second photo = the whole picture.
 * With nothing or one item found, the usual form is offered instead (`onSingle`).
 */
export function MultiAdd({
  userId,
  categories: initialCategories,
  initialFile,
  onSingle,
  onCancel,
}: {
  /** The photo picked on the "Add" screen: processing starts right away. */
  initialFile: File;
  userId: string;
  categories: CategoryOption[];
  onSingle: (seed: ItemSeed) => void;
  onCancel: () => void;
}) {
  const t = useTranslations("multi");
  const tBooks = useTranslations("books");
  const tMed = useTranslations("medicine");
  const [askMedicineCategory, setAskMedicineCategory] = useState<MedSubtype | null>(null);
  useHelpTopic("multi");
  // Categories plus a "Books" category created here; books found without one -> offer it.
  const books = useBooksCategory(initialCategories);
  const categories = books.categories;
  /** A medicine / supplement kind among `list` that has no category of its own (to offer it). */
  const missingMedicineCategory = (list: { ai: { medicine: MedicineSuggestion | null } }[]): MedSubtype | null =>
    (["medicine", "supplement"] as const).find(
      (k) => list.some((f) => f.ai.medicine?.subtype === k) && !medicineCategoryId(categories, k),
    ) ?? null;
  const [askBooksCategory, setAskBooksCategory] = useState(false);
  const tItems = useTranslations("items");
  const tCommon = useTranslations("common");
  const tDup = useTranslations("duplicates");
  const errorText = useErrorText();
  const { display: locale, mode: dataMode, edit: editLangs, lang: myLang } = useDataLang();
  const { byId, path } = useLocations();
  const offline = useOffline();
  const id = useId();
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);

  const [stage, setStage] = useState<Stage>({ kind: "pick" });
  const [overview, setOverview] = useState<(ProcessedPhoto & { url: string }) | null>(null);
  const [found, setFound] = useState<Found[]>([]);
  /** Card key -> existing item with a similar name (duplicate check, no AI). */
  const [similar, setSimilar] = useState<Record<string, ExistingItem>>({});
  const [error, setError] = useState<string>();
  const [invalid, setInvalid] = useState<Set<string>>(new Set());
  const [showBox, setShowBox] = useState<Found | null>(null);
  // The place for all items is "I'm here" itself: choosing it here changes it everywhere.
  const [locationId, setLocationId] = useHerePlace();
  const place = locationId ? byId.get(locationId) : undefined;
  const [picking, setPicking] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [saving, setSaving] = useState(false);

  // Object URLs of the previews are released when replaced and on unmount.
  const urls = useRef<string[]>([]);
  const track = (blob: Blob) => {
    const url = URL.createObjectURL(blob);
    urls.current.push(url);
    return url;
  };
  const releaseAll = () => {
    urls.current.forEach((u) => URL.revokeObjectURL(u));
    urls.current = [];
  };
  useEffect(() => releaseAll, []);

  const label = (c: CategoryOption) => (locale === "en" ? c.name_en || c.name_local : c.name_local || c.name_en);

  function reset() {
    releaseAll();
    setOverview(null);
    setFound([]);
    setSimilar({});
    setInvalid(new Set());
    setError(undefined);
    setStage({ kind: "pick" });
  }

  // The picked file and the SHA-256 of it: the same photo added again is caught before the AI.
  const fileRef = useRef<File | null>(null);
  const hashRef = useRef<string | null>(null);

  async function start(file: File | undefined, { recheck = true } = {}) {
    if (!file) return;
    reset();
    setStage({ kind: "working", step: "processing" });
    let photo: Awaited<ReturnType<typeof openPhoto>> | null = null;
    try {
      fileRef.current = file;
      const [opened, hash] = await Promise.all([openPhoto(file), fileHash(file)]);
      photo = opened;
      hashRef.current = hash;
      const whole = await photo.process();
      setOverview({ ...whole, url: track(whole.main) });

      if (recheck && hash) {
        const uses = (await findPhotoUses([hash]).catch(() => ({}) as Record<string, ExistingItem[]>))[hash];
        if (uses?.length) return setStage({ kind: "used", items: uses });
      }

      setStage({ kind: "working", step: "detecting" });
      const r = await recognizeItems(new Blob([whole.main], { type: "image/jpeg" }), locale);
      if ("error" in r) {
        setError(r.error);
        return setStage({ kind: "pick" });
      }

      setStage({ kind: "working", step: "cutting" });
      const items: Found[] = [];
      for (const ai of r.items) {
        const crop = await photo.crop(ai.box);
        items.push({
          key: crypto.randomUUID(),
          ai,
          crop,
          preview: track(crop.thumb),
          selected: true,
          touched: false,
          name_local: ai.name_local,
          name_en: ai.name_en,
          category_id: ai.category_id,
        });
      }
      setFound(items);
      setAskBooksCategory(!books.booksId && items.some((f) => f.ai.book));
      setAskMedicineCategory(missingMedicineCategory(items));
      setStage({ kind: "review" });
    } catch (e) {
      setError(e instanceof UnsupportedImageError ? "photoUnsupported" : "unknown");
      setStage({ kind: "pick" });
    } finally {
      photo?.close();
    }
  }

  // Start with the photo picked on the "Add" screen (once, also under Strict Mode).
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void Promise.resolve().then(() => start(initialFile));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cancel goes back to the "Add" screen; found items are not thrown away without asking.
  const [confirmCancel, setConfirmCancel] = useState(false);
  const cancel = () => (found.length > 0 ? setConfirmCancel(true) : onCancel());

  // The header's back arrow works as Cancel here (same question when items were found).
  const cancelRef = useRef(cancel);
  useEffect(() => {
    cancelRef.current = saving ? () => {} : cancel;
  });
  useEffect(() => {
    setBackOverride(() => cancelRef.current());
    return () => setBackOverride(null);
  }, []);

  const update = (key: string, patch: Partial<Found>) => {
    setFound((list) => list.map((f) => (f.key === key ? { ...f, ...patch } : f)));
    setInvalid((s) => {
      if (!s.has(key)) return s;
      const next = new Set(s);
      next.delete(key);
      return next;
    });
  };

  // Similar items already in the inventory (by name, no AI): checked when the list appears
  // and again when the place changes. Untouched cards with a match are unticked.
  const reviewKeys = stage.kind === "review" ? found.map((f) => f.key).join() : "";
  useEffect(() => {
    if (!reviewKeys) return;
    const list = found;
    let stale = false;
    findSimilarItems({ names: list.map((f) => ({ local: f.ai.name_local, en: f.ai.name_en })), locationId })
      .then((matches) => {
        if (stale) return;
        const byKey: Record<string, ExistingItem> = {};
        list.forEach((f, i) => {
          if (matches[i]) byKey[f.key] = matches[i];
        });
        setSimilar(byKey);
        setFound((cur) => cur.map((f) => (f.touched ? f : { ...f, selected: !byKey[f.key] })));
      })
      .catch(() => undefined);
    return () => {
      stale = true;
    };
    // Re-run for a new list or a new place only (not on every edit of a name).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reviewKeys, locationId]);
  const unticked = found.filter((f) => similar[f.key] && !f.selected).length;

  const selected = found.filter((f) => f.selected);
  const allSelected = found.length > 0 && selected.length === found.length;

  async function save() {
    if (!overview || selected.length === 0) return;
    setError(undefined);
    const bad = new Set(selected.filter((f) => !hasRequiredName(dataMode, f.name_local, f.name_en)).map((f) => f.key));
    setInvalid(bad);
    if (bad.size > 0) {
      document.getElementById(`${id}-${[...bad][0]}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      return setError("multiNameRequired");
    }

    setSaving(true);
    const supabase = createClient();
    const storage = supabase.storage.from(PHOTO_BUCKET);
    const items = selected.map((f) => ({ f, id: crypto.randomUUID(), photo: "" }));
    items.forEach((it) => (it.photo = photoPath(userId, it.id, crypto.randomUUID())));
    // The whole photo is uploaded once, into the first item's folder; the server copies it.
    const overviewPath = photoPath(userId, items[0].id, crypto.randomUUID());
    const files: { path: string; photo: { main: Blob; thumb: Blob } }[] = [
      { path: overviewPath, photo: overview },
      ...items.map((it) => ({ path: it.photo, photo: it.f.crop })),
    ];

    const uploaded: string[] = [];
    let done = 0;
    setProgress({ done: 0, total: files.length });
    const opts = { contentType: "image/jpeg", upsert: false };
    const ok = await runPool(
      files.map((file) => async () => {
        const [a, b] = await Promise.all([
          storage.upload(file.path, file.photo.main, opts),
          storage.upload(thumbPath(file.path), file.photo.thumb, opts),
        ]);
        if (!a.error || !b.error) uploaded.push(file.path);
        if (a.error || b.error) return false;
        setProgress({ done: ++done, total: files.length });
        return true;
      }),
      4,
    );
    setProgress(null);
    if (!ok) {
      await storage.remove(uploaded.flatMap(photoFiles));
      setSaving(false);
      return setError("photoUpload");
    }

    const result = await createItemsBatch({
      location_id: locationId,
      overview: overviewPath,
      overviewHash: hashRef.current,
      items: items.map(({ f, id: itemId, photo }) => ({
        id: itemId,
        photo,
        category_id: f.category_id,
        fields: {
          name_local: f.name_local,
          // Only my language shown: an edited name makes the AI's English stale,
          // so it is cleared and translated again in the background.
          name_en: dataMode === "local" && f.name_local.trim() !== f.ai.name_local ? "" : f.name_en,
          description_local: f.ai.description_local,
          description_en: f.ai.description_en,
          tags_local: f.ai.tags_local,
          tags_en: f.ai.tags_en,
          ...(f.ai.book && {
            book_author: f.ai.book.author ?? "",
            book_year: f.ai.book.year ? String(f.ai.book.year) : "",
            book_isbn: f.ai.book.isbn ?? "",
          }),
        },
        medicine: f.ai.medicine ? inputFromSuggestion(f.ai.medicine) : null,
      })),
    });
    setSaving(false);
    if (!result.ok) return setError(result.error);
    releaseAll();
    setFound([]);
    setOverview(null);
    setStage({ kind: "done", count: result.data.count, skipped: result.data.skipped, locationId });
  }

  const fileInput = (ref: React.RefObject<HTMLInputElement | null>, camera: boolean) => (
    <input
      ref={ref}
      type="file"
      accept="image/*"
      {...(camera ? { capture: "environment" as const } : {})}
      className="sr-only"
      tabIndex={-1}
      onChange={(e) => {
        void start(e.target.files?.[0]);
        e.target.value = "";
      }}
    />
  );

  if (stage.kind === "done") {
    return (
      <div className="flex flex-col gap-4">
        <p role="status" className="flex items-center gap-3 rounded-xl bg-surface px-4 py-4 font-medium">
          <Check className="size-6 shrink-0 text-accent" aria-hidden />
          {t("saved", { count: stage.count })}
        </p>
        {stage.skipped > 0 && <Alert tone="warning">{t("skippedByPlan", { count: stage.skipped })}</Alert>}
        <Link
          href={stage.locationId ? `/locations/${stage.locationId}` : "/"}
          className="flex min-h-12 items-center justify-center rounded-xl bg-accent px-4 font-semibold text-accent-foreground"
        >
          {stage.locationId ? t("openPlace") : t("openItems")}
        </Link>
        <Button onClick={reset}>{t("another")}</Button>
      </div>
    );
  }

  const working = stage.kind === "working";
  const pickButtons = (
    <div className="grid grid-cols-2 gap-2">
      <button
        type="button"
        disabled={working || offline}
        onClick={() => cameraRef.current?.click()}
        className="flex min-h-14 items-center justify-center gap-2 rounded-xl bg-accent px-3 font-semibold text-accent-foreground disabled:opacity-50"
      >
        <Camera className="size-5" aria-hidden />
        {tItems("takePhoto")}
      </button>
      <button
        type="button"
        disabled={working || offline}
        onClick={() => galleryRef.current?.click()}
        className="flex min-h-14 items-center justify-center gap-2 rounded-xl border border-border bg-surface px-3 font-medium disabled:opacity-50"
      >
        <ImagePlus className="size-5" aria-hidden />
        {tItems("fromGallery")}
      </button>
      {fileInput(cameraRef, true)}
      {fileInput(galleryRef, false)}
    </div>
  );

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start gap-3 rounded-xl bg-surface px-4 py-3">
        <ScanSearch className="mt-0.5 size-5 shrink-0 text-accent" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="font-medium">{t("title")}</p>
          <p className="text-sm text-muted">{t("intro")}</p>
        </div>
        {stage.kind === "review" && found.length > 1 && (
          <Button variant="ghost" onClick={reset} disabled={saving} className="-mt-2 -mr-3 shrink-0 text-sm">
            {t("otherPhoto")}
          </Button>
        )}
      </div>

      {error && <Alert>{errorText(error)}</Alert>}

      {(stage.kind === "pick" || working) && (
        <>
          {overview && (
            <Photo src={overview.url} alt={t("wholePhoto")} className="max-h-72 w-full rounded-xl object-contain" />
          )}
          {working ? (
            <p role="status" className="flex min-h-11 items-center gap-2 text-sm text-muted">
              <LoaderCircle className="size-4 animate-spin" aria-hidden />
              {t(`step.${stage.step}`)}
            </p>
          ) : (
            <>
              {pickButtons}
              <p className="text-sm text-muted">{t("tips")}</p>
            </>
          )}
          <Button onClick={cancel}>{tCommon("cancel")}</Button>
        </>
      )}

      {stage.kind === "used" && (
        <PhotoUsedNotice
          items={stage.items}
          actions={
            <>
              <Button variant="primary" onClick={() => void start(fileRef.current ?? undefined, { recheck: false })}>
                {tDup("recognizeAnyway")}
              </Button>
              <Button onClick={onCancel}>{tCommon("cancel")}</Button>
            </>
          }
        />
      )}

      {stage.kind === "review" && overview && (
        <>
          {askBooksCategory && !books.booksId && found.length > 1 && (
            <BooksCategoryCard
              many
              pending={books.pending}
              failed={books.failed}
              onDismiss={() => setAskBooksCategory(false)}
              onCreate={async () => {
                const created = await books.create({ local: tBooks("categoryName"), en: "Books" });
                if (!created) return;
                // Every found book without a category goes there.
                setFound((list) => list.map((f) => (f.ai.book && !f.category_id ? { ...f, category_id: created } : f)));
                setAskBooksCategory(false);
              }}
            />
          )}
          {askMedicineCategory && !medicineCategoryId(categories, askMedicineCategory) && found.length > 1 && (
            <MedicineCategoryCard
              subtype={askMedicineCategory}
              pending={books.pending}
              failed={books.failed}
              onDismiss={() => setAskMedicineCategory(null)}
              onCreate={async () => {
                const subtype = askMedicineCategory;
                const created = await books.create(
                  subtype === "supplement"
                    ? { local: tMed("categorySupplements"), en: "Vitamins & supplements" }
                    : { local: tMed("categoryMedicines"), en: "Medicines" },
                );
                if (!created) return;
                // Every found medicine / supplement of this kind without a category goes there.
                const next = found.map((f) => (f.ai.medicine?.subtype === subtype && !f.category_id ? { ...f, category_id: created } : f));
                setFound(next);
                setAskMedicineCategory(
                  missingMedicineCategory(next.filter((f) => f.ai.medicine?.subtype !== subtype)),
                );
              }}
            />
          )}
          {found.length <= 1 && (
            <div className="flex flex-col gap-3 rounded-xl border border-border px-4 py-3">
              <p>{found.length === 0 ? t("noneFound") : t("oneFound")}</p>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="primary"
                  onClick={() =>
                    onSingle(
                      found[0]
                        ? { photos: [found[0].crop], recognition: found[0].ai }
                        : { photos: [overview], recognition: null },
                    )
                  }
                >
                  {t("useSingle")}
                </Button>
                <Button onClick={reset}>{t("otherPhoto")}</Button>
              </div>
            </div>
          )}

          {found.length > 0 && (
            <>
              <div className="flex flex-col gap-1.5">
                <span className="text-sm font-medium">{t("placeForAll")}</span>
                <span className="-mt-1 text-sm text-muted">{tItems("placeIsHere")}</span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setPicking(true)}
                    className="flex min-h-12 min-w-0 flex-1 items-center gap-2 rounded-xl border border-border bg-surface px-4 text-left"
                  >
                    <span className={`min-w-0 flex-1 truncate ${place ? "" : "text-muted"}`}>
                      {place ? path(place) : tItems("noPlaceSelected")}
                    </span>
                    <ChevronRight className="size-5 shrink-0 text-muted" aria-hidden />
                  </button>
                  {place && (
                    <button
                      type="button"
                      onClick={() => setLocationId(null)}
                      aria-label={tItems("clearPlace")}
                      className="flex size-12 shrink-0 items-center justify-center rounded-xl text-muted"
                    >
                      <X className="size-5" aria-hidden />
                    </button>
                  )}
                </div>
                <PlaceAssistant mode="move" onPlace={(next) => setLocationId(next)} />
              </div>

              <div className="flex items-center justify-between gap-2">
                <span className="text-sm text-muted">
                  {t("selectedOf", { n: selected.length, total: found.length })}
                </span>
                <Button
                  variant="ghost"
                  className="-mr-4"
                  onClick={() => setFound((list) => list.map((f) => ({ ...f, selected: !allSelected, touched: true })))}
                >
                  {allSelected ? t("selectNone") : t("selectAll")}
                </Button>
              </div>
              {unticked > 0 && (
                <p className="-mt-2 text-sm text-amber-800 dark:text-amber-200">
                  {tDup("similarHint", { count: unticked })}
                </p>
              )}

              <ul className="flex flex-col gap-3">
                {found.map((f, i) => {
                  const bad = invalid.has(f.key);
                  return (
                    <li
                      key={f.key}
                      id={`${id}-${f.key}`}
                      className={`flex flex-col gap-2 rounded-xl border p-2 ${bad ? "border-red-500" : "border-border"}`}
                    >
                      <div className={`flex gap-3 transition-opacity ${f.selected ? "" : "opacity-60"}`}>
                        <button
                          type="button"
                          onClick={() => setShowBox(f)}
                          aria-label={t("showOnPhoto", { n: i + 1 })}
                          className="size-20 shrink-0 overflow-hidden rounded-lg bg-surface"
                        >
                          <Photo src={f.preview} alt="" className="size-full object-cover" />
                        </button>
                        <div className="flex min-w-0 flex-1 flex-col gap-2">
                          {editLangs.map((slot) => {
                            const key = slot === "local" ? "name_local" : "name_en";
                            const lang = slot === "local" ? myLang : "en";
                            return (
                              <input
                                key={slot}
                                lang={lang}
                                value={f[key]}
                                maxLength={ITEM_NAME_MAX}
                                disabled={saving}
                                aria-invalid={bad || undefined}
                                aria-label={
                                  editLangs.length === 1
                                    ? t("nameOf", { n: i + 1 })
                                    : `${t("nameOf", { n: i + 1 })} (${lang.toUpperCase()})`
                                }
                                placeholder={editLangs.length === 1 ? undefined : lang.toUpperCase()}
                                onChange={(e) => update(f.key, { [key]: e.target.value })}
                                className={fieldClass}
                              />
                            );
                          })}
                          <select
                            value={f.category_id ?? ""}
                            disabled={saving}
                            aria-label={t("categoryOf", { n: i + 1 })}
                            onChange={(e) => update(f.key, { category_id: e.target.value || null })}
                            className={`${fieldClass} appearance-none text-sm`}
                          >
                            <option value="">{tItems("noCategory")}</option>
                            {categories.map((c) => (
                              <option key={c.id} value={c.id}>
                                {label(c)}
                              </option>
                            ))}
                          </select>
                        </div>
                        <button
                          type="button"
                          role="checkbox"
                          aria-checked={f.selected}
                          aria-label={t("saveThis", { n: i + 1 })}
                          disabled={saving}
                          onClick={() => update(f.key, { selected: !f.selected, touched: true })}
                          className="-m-2 flex size-11 shrink-0 items-start justify-end p-2"
                        >
                          <span
                            className={`flex size-6 items-center justify-center rounded-md border-2 ${
                              f.selected ? "border-accent bg-accent text-accent-foreground" : "border-border"
                            }`}
                          >
                            {f.selected && <Check className="size-4" strokeWidth={3} aria-hidden />}
                          </span>
                        </button>
                      </div>
                      {f.ai.book && (f.ai.book.author || f.ai.book.year) && (
                        <p className="flex items-center gap-1.5 px-1 text-sm text-muted">
                          <BookOpen className="size-4 shrink-0 text-accent" aria-label={tBooks("title")} />
                          <span className="min-w-0 truncate">
                            {[f.ai.book.author, f.ai.book.year].filter(Boolean).join(" · ")}
                          </span>
                        </p>
                      )}
                      {f.ai.medicine && <MedicineLine m={f.ai.medicine} />}
                      {similar[f.key] && <SimilarNote item={similar[f.key]} />}
                    </li>
                  );
                })}
              </ul>

              <StickyActions>
                <Button onClick={cancel} disabled={saving} className="flex-1">
                  {tCommon("cancel")}
                </Button>
                <Button
                  variant="primary"
                  pending={saving}
                  disabled={offline || selected.length === 0}
                  onClick={() => void save()}
                  className="flex-[2]"
                >
                  {progress
                    ? tItems("uploading", { done: Math.min(progress.done + 1, progress.total), total: progress.total })
                    : saving
                      ? tItems("saving")
                      : t("saveSelected", { count: selected.length })}
                </Button>
              </StickyActions>
            </>
          )}
        </>
      )}

      <Sheet
        open={confirmCancel}
        onClose={() => setConfirmCancel(false)}
        title={t("cancelTitle")}
        footer={
          <div className="flex gap-2">
            <Button onClick={() => setConfirmCancel(false)} className="flex-1">
              {t("keepReviewing")}
            </Button>
            <Button variant="danger" onClick={onCancel} className="flex-1">
              {t("discard")}
            </Button>
          </div>
        }
      >
        <p>{t("cancelText", { count: found.length })}</p>
      </Sheet>

      <LocationPicker
        open={picking}
        onClose={() => setPicking(false)}
        title={tItems("choosePlace")}
        initialId={locationId}
        onSelect={(next) => {
          setLocationId(next);
          setPicking(false);
        }}
      />

      <Sheet
        open={!!showBox}
        onClose={() => setShowBox(null)}
        title={
          showBox ? (locale === "en" ? showBox.name_en || showBox.name_local : showBox.name_local || showBox.name_en) : ""
        }
      >
        {showBox && overview && (
          <div className="relative overflow-hidden rounded-lg">
            <Photo src={overview.url} alt={t("wholePhoto")} className="block w-full" />
            <span
              aria-hidden
              className="absolute rounded-md border-2 border-accent shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]"
              style={{
                top: `${showBox.ai.box[0] / 10}%`,
                left: `${showBox.ai.box[1] / 10}%`,
                height: `${(showBox.ai.box[2] - showBox.ai.box[0]) / 10}%`,
                width: `${(showBox.ai.box[3] - showBox.ai.box[1]) / 10}%`,
              }}
            />
          </div>
        )}
      </Sheet>
    </div>
  );
}

/** "Ibuprofen · 200 mg", or the first components of a supplement, and the expiry chip. */
function MedicineLine({ m }: { m: MedicineSuggestion }) {
  const t = useTranslations("medicine");
  const { display } = useDataLang();
  const pick = (l: string, e: string) => (display === "local" ? l || e : e || l);
  const text =
    m.subtype === "supplement"
      ? m.components.slice(0, 3).map((c) => [pick(c.name_local, c.name_en), c.amount].filter(Boolean).join(" ")).join(", ")
      : [pick(m.active_local, m.active_en), m.strength].filter(Boolean).join(" · ");
  return (
    <p className="flex items-center gap-1.5 px-1 text-sm text-muted">
      <Pill className="size-4 shrink-0 text-accent" aria-label={m.subtype === "supplement" ? t("subtypeSupplement") : t("subtypeMedicine")} />
      <span className="min-w-0 truncate">{text || (m.subtype === "supplement" ? t("subtypeSupplement") : t("subtypeMedicine"))}</span>
      {m.expires && <ExpiryBadge date={m.expires.date} precision={m.expires.precision} always />}
    </p>
  );
}
