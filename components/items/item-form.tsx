"use client";

import { useDataLang } from "@/components/data-lang/context";
import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, useWatch, type UseFormReturn } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ChevronRight, LoaderCircle, Sparkles, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { createItem, updateItem } from "@/app/(app)/items/actions";
import { LocationPicker } from "@/components/locations/location-picker";
import { PlaceAssistant } from "@/components/locations/place-assistant";
import { useCurrentLocation, useLocations } from "@/components/locations/locations-context";
import { NameFields } from "@/components/name-fields";
import { Alert, Button } from "@/components/ui/buttons";
import { recognizeItem } from "@/lib/ai/client";
import type { ItemSuggestion, RecognizeResult } from "@/lib/ai/types";
import type { CategoryOption } from "@/lib/items/data";
import type { ItemDetail } from "@/lib/items/types";
import { PHOTO_BUCKET, photoFiles, photoPath, thumbPath } from "@/lib/photos/paths";
import { createClient } from "@/lib/supabase/client";
import { isVisibleTag } from "@/lib/data-lang";
import { useErrorText } from "@/lib/use-error-text";
import { DESCRIPTION_MAX, ITEM_NAME_MAX, itemFieldsSchema, type ItemFieldsInput } from "@/lib/validation/items";
import type { NamePairInput } from "@/lib/validation/names";
import { PhotoPicker, type PhotoDraft } from "./photo-picker";
import { useOffline } from "@/components/offline-banner";
import { ItemSuggestionCard } from "./item-suggestion";
import { TagsInput } from "./tags-input";

type Props = { userId: string; categories: CategoryOption[] } & (
  | { mode: "create"; item?: undefined }
  | { mode: "edit"; item: ItemDetail }
);

const fieldClass =
  "w-full rounded-xl border border-border bg-surface px-4 py-3 text-base outline-none focus:border-accent aria-invalid:border-red-500";

export function ItemForm({ mode, item, userId, categories }: Props) {
  const t = useTranslations("items");
  const tCommon = useTranslations("common");
  const errorText = useErrorText();
  const { display: locale, mode: dataMode, edit: editLangs } = useDataLang();
  const router = useRouter();
  const id = useId();
  const { byId, path } = useLocations();
  const here = useCurrentLocation();

  const [photos, setPhotos] = useState<PhotoDraft[]>(
    () => item?.photos.map((p) => ({ key: p.id, kind: "existing" as const, path: p.path, preview: p.thumbUrl, url: p.url })) ?? [],
  );
  const [primaryKey, setPrimaryKey] = useState<string | null>(
    () => item?.photos.find((p) => p.isPrimary)?.id ?? item?.photos[0]?.id ?? null,
  );
  const [categoryId, setCategoryId] = useState<string | null>(item?.categoryId ?? null);
  // undefined = not chosen yet: a new item then follows the "I'm here" place, which is known
  // only after hydration (it lives in localStorage), so it is derived instead of copied once.
  const [chosenLocation, setLocationId] = useState<string | null | undefined>(mode === "edit" ? item.locationId : undefined);
  const locationId = chosenLocation === undefined ? (here?.id ?? null) : chosenLocation;
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState<string>();
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [recognizing, setRecognizing] = useState(false);
  const [recognized, setRecognized] = useState(false);
  const [aiError, setAiError] = useState<string>();
  const [suggestion, setSuggestion] = useState<ItemSuggestion | null>(null);

  const form = useForm<ItemFieldsInput>({
    resolver: zodResolver(itemFieldsSchema(dataMode)),
    // Hidden-language text stays in the form values (not shown); the server decides what
    // to write. Tags hidden in this mode are not shown and are kept by the server.
    defaultValues: {
      name_ru: item?.nameRu ?? "",
      name_en: item?.nameEn ?? "",
      description_ru: item?.descriptionRu ?? "",
      description_en: item?.descriptionEn ?? "",
      tags: (item?.tags ?? []).filter((tag) => isVisibleTag(tag, dataMode)),
    },
  });
  const {
    register,
    control,
    setValue,
    formState: { errors, isSubmitting },
  } = form;
  const tags = useWatch({ control, name: "tags" });

  const place = locationId ? byId.get(locationId) : undefined;

  /** AI prefills only empty fields: what the user typed is never overwritten. */
  function applyRecognition(r: RecognizeResult) {
    const v = form.getValues();
    const fill = (name: "name_ru" | "name_en" | "description_ru" | "description_en", value: string) => {
      if (value && !v[name].trim()) setValue(name, value, { shouldDirty: true, shouldValidate: name.startsWith("name") });
    };
    fill("name_ru", r.name_ru);
    fill("name_en", r.name_en);
    fill("description_ru", r.description_ru);
    fill("description_en", r.description_en);
    if (r.tags.length && v.tags.length === 0) setValue("tags", r.tags, { shouldDirty: true });
    if (r.category_id) setCategoryId((current) => current ?? r.category_id);
  }

  async function recognize(photo: PhotoDraft | undefined) {
    if (!photo) return;
    setAiError(undefined);
    setRecognizing(true);
    try {
      // New photo: the processed JPEG; stored photo: download it through its signed URL.
      const image = photo.kind === "new" ? photo.main : photo.url ? await (await fetch(photo.url)).blob() : null;
      if (!image) return setAiError("aiFailed");
      const r = await recognizeItem(new Blob([image], { type: "image/jpeg" }), locale);
      if ("error" in r) return setAiError(r.error);
      applyRecognition(r);
      setRecognized(true);
    } catch {
      setAiError("network");
    } finally {
      setRecognizing(false);
    }
  }

  function acceptSuggestion(s: ItemSuggestion) {
    const opts = { shouldDirty: true, shouldValidate: true };
    if (s.name_ru) setValue("name_ru", s.name_ru, opts);
    if (s.name_en) setValue("name_en", s.name_en, opts);
    if (s.description_ru) setValue("description_ru", s.description_ru, opts);
    if (s.description_en) setValue("description_en", s.description_en, opts);
    if (s.tags_add.length) {
      const current = form.getValues("tags");
      const lower = new Set(current.map((x) => x.toLowerCase()));
      setValue("tags", [...current, ...s.tags_add.filter((x) => !lower.has(x.toLowerCase()))].slice(0, 50), opts);
    }
    setSuggestion(null);
  }
  const label = (c: CategoryOption) => (locale === "en" ? c.name_en || c.name_ru : c.name_ru || c.name_en);

  const submit = form.handleSubmit(async (fields) => {
    setError(undefined);
    const itemId = mode === "edit" ? item.id : crypto.randomUUID();
    const supabase = createClient();
    const storage = supabase.storage.from(PHOTO_BUCKET);

    // 1. Upload new photos (main + thumbnail) straight to Storage; RLS allows only the user's folder.
    const fresh = photos.filter((p) => p.kind === "new");
    const pathByKey = new Map(photos.flatMap((p) => (p.kind === "existing" ? [[p.key, p.path] as const] : [])));
    const uploaded: string[] = [];
    setProgress(fresh.length ? { done: 0, total: fresh.length } : null);
    for (const p of fresh) {
      const main = photoPath(userId, itemId, crypto.randomUUID());
      const opts = { contentType: "image/jpeg", upsert: false };
      const [a, b] = await Promise.all([storage.upload(main, p.main, opts), storage.upload(thumbPath(main), p.thumb, opts)]);
      if (a.error || b.error) {
        await storage.remove([...uploaded, main].flatMap(photoFiles));
        setProgress(null);
        return setError("photoUpload");
      }
      uploaded.push(main);
      pathByKey.set(p.key, main);
      setProgress({ done: uploaded.length, total: fresh.length });
    }
    setProgress(null);

    // 2. Save the item; the server action removes the uploaded files itself if saving fails.
    const ordered = photos.map((p) => pathByKey.get(p.key)!);
    const primary = primaryKey ? (pathByKey.get(primaryKey) ?? null) : null;
    const common = { fields, category_id: categoryId, location_id: locationId };
    const result =
      mode === "create"
        ? await createItem({ ...common, id: itemId, photos: ordered, primary })
        : await updateItem({
            ...common,
            id: itemId,
            keep: photos.flatMap((p) => (p.kind === "existing" ? [p.path] : [])),
            add: uploaded,
            primary,
          });
    if (!result.ok) return setError(result.error);

    router.replace(`/items/${itemId}`);
  });

  const busy = isSubmitting || progress !== null;
  const offline = useOffline();
  const fieldError = (key?: string) => (key ? errorText(key) : undefined);

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-6">
      <PhotoPicker
        photos={photos}
        primaryKey={primaryKey}
        onError={setError}
        onChange={(next, primary) => {
          // First photo of an item with no name yet: recognize it automatically (1 AI request).
          const v = form.getValues();
          const firstPhoto = photos.length === 0 && next.length > 0;
          if (firstPhoto && !v.name_ru.trim() && !v.name_en.trim() && !recognized) {
            void recognize(next.find((p) => p.key === primary) ?? next[0]);
          }
          setPhotos(next);
          setPrimaryKey(primary);
        }}
      />

      {(recognizing || photos.length > 0) && (
        <div className="-mt-2 flex flex-col gap-2">
          {recognizing ? (
            <p role="status" className="flex min-h-11 items-center gap-2 text-sm text-muted">
              <LoaderCircle className="size-4 animate-spin" aria-hidden />
              {t("recognizing")}
            </p>
          ) : (
            <div className="flex flex-wrap items-center gap-x-3">
              {recognized && <span className="text-sm text-muted">{t("recognized")}</span>}
              <Button
                variant="ghost"
                className="-ml-4 text-sm"
                onClick={() => void recognize(photos.find((p) => p.key === primaryKey) ?? photos[0])}
              >
                <Sparkles className="size-4" aria-hidden />
                {recognized ? t("recognizeAgain") : t("recognize")}
              </Button>
            </div>
          )}
          {aiError && <Alert>{errorText(aiError)}</Alert>}
        </div>
      )}

      {error && <Alert>{errorText(error)}</Alert>}

      <NameFields form={form as unknown as UseFormReturn<NamePairInput>} max={ITEM_NAME_MAX} />

      {editLangs.map((lang) => {
        const name = lang === "ru" ? "description_ru" : "description_en";
        const err = fieldError(errors[name]?.message);
        return (
          <div key={lang} className="flex flex-col gap-1.5">
            <label htmlFor={`${id}-${name}`} className="text-sm font-medium">
              {editLangs.length === 1 ? t("description") : lang === "ru" ? t("descriptionRu") : t("descriptionEn")}
            </label>
            <textarea
              id={`${id}-${name}`}
              lang={lang}
              rows={3}
              maxLength={DESCRIPTION_MAX}
              aria-invalid={err ? true : undefined}
              className={`${fieldClass} resize-y`}
              {...register(name)}
            />
            {err && <p className="text-sm text-red-600 dark:text-red-400">{err}</p>}
          </div>
        );
      })}

      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-category`} className="text-sm font-medium">
          {t("category")}
        </label>
        <select
          id={`${id}-category`}
          value={categoryId ?? ""}
          onChange={(e) => setCategoryId(e.target.value || null)}
          className={`${fieldClass} min-h-12 appearance-none`}
        >
          <option value="">{t("noCategory")}</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {label(c)}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">{t("place")}</span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setPicking(true)}
            className="flex min-h-12 min-w-0 flex-1 items-center gap-2 rounded-xl border border-border bg-surface px-4 text-left"
          >
            <span className={`min-w-0 flex-1 truncate ${place ? "" : "text-muted"}`}>
              {place ? path(place) : t("noPlaceSelected")}
            </span>
            <ChevronRight className="size-5 shrink-0 text-muted" aria-hidden />
          </button>
          {place && (
            <button
              type="button"
              onClick={() => setLocationId(null)}
              aria-label={t("clearPlace")}
              className="flex size-12 shrink-0 items-center justify-center rounded-xl text-muted"
            >
              <X className="size-5" aria-hidden />
            </button>
          )}
        </div>
      </div>

      <div className="-mt-3 flex flex-col gap-2">
        <span className="text-sm text-muted">{t("placeVoiceHint")}</span>
        <PlaceAssistant
          mode="form"
          getItemContext={() => {
            const v = form.getValues();
            return { ...v, tags: v.tags };
          }}
          onPlace={(next) => setLocationId(next)}
          onItemSuggestion={setSuggestion}
        />
        {suggestion && (
          <ItemSuggestionCard
            suggestion={suggestion}
            onAccept={() => acceptSuggestion(suggestion)}
            onDecline={() => setSuggestion(null)}
          />
        )}
      </div>

      <TagsInput value={tags} onChange={(tags) => setValue("tags", tags, { shouldValidate: true, shouldDirty: true })} />
      {errors.tags && <p className="-mt-4 text-sm text-red-600 dark:text-red-400">{fieldError(errors.tags.message ?? errors.tags[0]?.message)}</p>}

      <div className="flex gap-2">
        <Button onClick={() => router.back()} disabled={busy} className="flex-1">
          {tCommon("cancel")}
        </Button>
        <Button variant="primary" type="submit" pending={busy} disabled={offline} className="flex-[2]">
          {progress
            ? t("uploading", { done: Math.min(progress.done + 1, progress.total), total: progress.total })
            : busy
              ? t("saving")
              : t("save")}
        </Button>
      </div>

      <LocationPicker
        open={picking}
        onClose={() => setPicking(false)}
        title={t("choosePlace")}
        initialId={locationId}
        onSelect={(next) => {
          setLocationId(next);
          setPicking(false);
        }}
      />
    </form>
  );
}
