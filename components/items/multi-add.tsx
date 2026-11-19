"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { Camera, Check, ChevronRight, ImagePlus, LoaderCircle, ScanSearch, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { createItemsBatch } from "@/app/(app)/items/actions";
import { useDataLang } from "@/components/data-lang/context";
import { LocationPicker } from "@/components/locations/location-picker";
import { PlaceAssistant } from "@/components/locations/place-assistant";
import { useCurrentLocation, useLocations } from "@/components/locations/locations-context";
import { useOffline } from "@/components/offline-banner";
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
import type { ItemSeed } from "./item-form";

type Found = {
  key: string;
  ai: DetectedItem;
  crop: ProcessedPhoto;
  preview: string;
  selected: boolean;
  name_ru: string;
  name_en: string;
  category_id: string | null;
};

type Stage =
  | { kind: "pick" }
  | { kind: "working"; step: "processing" | "detecting" | "cutting" }
  | { kind: "review" }
  | { kind: "done"; count: number; locationId: string | null };

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
  categories,
  onSingle,
  onCancel,
}: {
  userId: string;
  categories: CategoryOption[];
  onSingle: (seed: ItemSeed) => void;
  onCancel: () => void;
}) {
  const t = useTranslations("multi");
  const tItems = useTranslations("items");
  const errorText = useErrorText();
  const { display: locale, mode: dataMode, edit: editLangs } = useDataLang();
  const { byId, path } = useLocations();
  const here = useCurrentLocation();
  const offline = useOffline();
  const id = useId();
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);

  const [stage, setStage] = useState<Stage>({ kind: "pick" });
  const [overview, setOverview] = useState<(ProcessedPhoto & { url: string }) | null>(null);
  const [found, setFound] = useState<Found[]>([]);
  const [error, setError] = useState<string>();
  const [invalid, setInvalid] = useState<Set<string>>(new Set());
  const [showBox, setShowBox] = useState<Found | null>(null);
  const [chosenLocation, setLocationId] = useState<string | null | undefined>(undefined);
  const locationId = chosenLocation === undefined ? (here?.id ?? null) : chosenLocation;
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

  const label = (c: CategoryOption) => (locale === "en" ? c.name_en || c.name_ru : c.name_ru || c.name_en);

  function reset() {
    releaseAll();
    setOverview(null);
    setFound([]);
    setInvalid(new Set());
    setError(undefined);
    setStage({ kind: "pick" });
  }

  async function start(file: File | undefined) {
    if (!file) return;
    reset();
    setStage({ kind: "working", step: "processing" });
    let photo: Awaited<ReturnType<typeof openPhoto>> | null = null;
    try {
      photo = await openPhoto(file);
      const whole = await photo.process();
      setOverview({ ...whole, url: track(whole.main) });

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
          name_ru: ai.name_ru,
          name_en: ai.name_en,
          category_id: ai.category_id,
        });
      }
      setFound(items);
      setStage({ kind: "review" });
    } catch (e) {
      setError(e instanceof UnsupportedImageError ? "photoUnsupported" : "unknown");
      setStage({ kind: "pick" });
    } finally {
      photo?.close();
    }
  }

  const update = (key: string, patch: Partial<Found>) => {
    setFound((list) => list.map((f) => (f.key === key ? { ...f, ...patch } : f)));
    setInvalid((s) => {
      if (!s.has(key)) return s;
      const next = new Set(s);
      next.delete(key);
      return next;
    });
  };

  const selected = found.filter((f) => f.selected);
  const allSelected = found.length > 0 && selected.length === found.length;

  async function save() {
    if (!overview || selected.length === 0) return;
    setError(undefined);
    const bad = new Set(selected.filter((f) => !hasRequiredName(dataMode, f.name_ru, f.name_en)).map((f) => f.key));
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
      items: items.map(({ f, id: itemId, photo }) => ({
        id: itemId,
        photo,
        category_id: f.category_id,
        fields: {
          name_ru: f.name_ru,
          // Ru mode shows only Russian: an edited Russian name makes the AI's English stale,
          // so it is cleared and translated again in the background.
          name_en: dataMode === "ru" && f.name_ru.trim() !== f.ai.name_ru ? "" : f.name_en,
          description_ru: f.ai.description_ru,
          description_en: f.ai.description_en,
          tags: f.ai.tags,
        },
      })),
    });
    setSaving(false);
    if (!result.ok) return setError(result.error);
    releaseAll();
    setFound([]);
    setOverview(null);
    setStage({ kind: "done", count: result.data.count, locationId });
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
        <Link
          href={stage.locationId ? `/locations/${stage.locationId}` : "/items"}
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
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          aria-label={t("backToSingle")}
          className="-mt-2 -mr-3 flex size-11 shrink-0 items-center justify-center text-muted"
        >
          <X className="size-5" aria-hidden />
        </button>
      </div>

      {error && <Alert>{errorText(error)}</Alert>}

      {(stage.kind === "pick" || working) && (
        <>
          {overview && <Photo src={overview.url} alt={t("wholePhoto")} className="max-h-72 w-full rounded-xl object-contain" />}
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
        </>
      )}

      {stage.kind === "review" && overview && (
        <>
          {found.length <= 1 && (
            <div className="flex flex-col gap-3 rounded-xl border border-border px-4 py-3">
              <p>{found.length === 0 ? t("noneFound") : t("oneFound")}</p>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="primary"
                  onClick={() =>
                    onSingle(
                      found[0]
                        ? { photo: found[0].crop, recognition: found[0].ai }
                        : { photo: overview, recognition: null },
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
                <span className="text-sm text-muted">{t("selectedOf", { n: selected.length, total: found.length })}</span>
                <Button
                  variant="ghost"
                  className="-mr-4"
                  onClick={() => setFound((list) => list.map((f) => ({ ...f, selected: !allSelected })))}
                >
                  {allSelected ? t("selectNone") : t("selectAll")}
                </Button>
              </div>

              <ul className="flex flex-col gap-3">
                {found.map((f, i) => {
                  const bad = invalid.has(f.key);
                  return (
                    <li
                      key={f.key}
                      id={`${id}-${f.key}`}
                      className={`flex gap-3 rounded-xl border p-2 transition-opacity ${
                        bad ? "border-red-500" : "border-border"
                      } ${f.selected ? "" : "opacity-60"}`}
                    >
                      <button
                        type="button"
                        onClick={() => setShowBox(f)}
                        aria-label={t("showOnPhoto", { n: i + 1 })}
                        className="size-20 shrink-0 overflow-hidden rounded-lg bg-surface"
                      >
                        <Photo src={f.preview} alt="" className="size-full object-cover" />
                      </button>
                      <div className="flex min-w-0 flex-1 flex-col gap-2">
                        {editLangs.map((lang) => {
                          const key = lang === "ru" ? "name_ru" : "name_en";
                          return (
                            <input
                              key={lang}
                              lang={lang}
                              value={f[key]}
                              maxLength={ITEM_NAME_MAX}
                              disabled={saving}
                              aria-invalid={bad || undefined}
                              aria-label={editLangs.length === 1 ? t("nameOf", { n: i + 1 }) : `${t("nameOf", { n: i + 1 })} (${lang.toUpperCase()})`}
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
                        onClick={() => update(f.key, { selected: !f.selected })}
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
                    </li>
                  );
                })}
              </ul>

              <div className="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] -mx-4 flex gap-2 bg-background/95 px-4 py-2 backdrop-blur">
                <Button onClick={reset} disabled={saving} className="flex-1">
                  {t("otherPhoto")}
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
              </div>
            </>
          )}
        </>
      )}

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

      <Sheet open={!!showBox} onClose={() => setShowBox(null)} title={showBox ? (locale === "en" ? showBox.name_en || showBox.name_ru : showBox.name_ru || showBox.name_en) : ""}>
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
