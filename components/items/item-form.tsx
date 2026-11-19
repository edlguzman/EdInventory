"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, useWatch, type UseFormReturn } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ChevronRight, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { createItem, updateItem } from "@/app/(app)/items/actions";
import { LocationPicker } from "@/components/locations/location-picker";
import { useCurrentLocation, useLocations } from "@/components/locations/locations-context";
import { NameFields } from "@/components/name-fields";
import { Alert, Button } from "@/components/ui/buttons";
import type { CategoryOption } from "@/lib/items/data";
import type { ItemDetail } from "@/lib/items/types";
import { PHOTO_BUCKET, photoFiles, photoPath, thumbPath } from "@/lib/photos/paths";
import { createClient } from "@/lib/supabase/client";
import { useErrorText } from "@/lib/use-error-text";
import { DESCRIPTION_MAX, ITEM_NAME_MAX, itemFieldsSchema, type ItemFieldsInput } from "@/lib/validation/items";
import type { NamePairInput } from "@/lib/validation/names";
import { PhotoPicker, type PhotoDraft } from "./photo-picker";
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
  const locale = useLocale();
  const router = useRouter();
  const id = useId();
  const { byId, path } = useLocations();
  const here = useCurrentLocation();

  const [photos, setPhotos] = useState<PhotoDraft[]>(
    () => item?.photos.map((p) => ({ key: p.id, kind: "existing" as const, path: p.path, preview: p.thumbUrl })) ?? [],
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

  const form = useForm<ItemFieldsInput>({
    resolver: zodResolver(itemFieldsSchema),
    defaultValues: {
      name_ru: item?.nameRu ?? "",
      name_en: item?.nameEn ?? "",
      description_ru: item?.descriptionRu ?? "",
      description_en: item?.descriptionEn ?? "",
      tags: item?.tags ?? [],
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
  const fieldError = (key?: string) => (key ? errorText(key) : undefined);

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-6">
      <PhotoPicker
        photos={photos}
        primaryKey={primaryKey}
        onError={setError}
        onChange={(next, primary) => {
          setPhotos(next);
          setPrimaryKey(primary);
        }}
      />

      {error && <Alert>{errorText(error)}</Alert>}

      <NameFields form={form as unknown as UseFormReturn<NamePairInput>} max={ITEM_NAME_MAX} />

      {(["ru", "en"] as const).map((lang) => {
        const name = lang === "ru" ? "description_ru" : "description_en";
        const err = fieldError(errors[name]?.message);
        return (
          <div key={lang} className="flex flex-col gap-1.5">
            <label htmlFor={`${id}-${name}`} className="text-sm font-medium">
              {lang === "ru" ? t("descriptionRu") : t("descriptionEn")}
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

      <TagsInput value={tags} onChange={(tags) => setValue("tags", tags, { shouldValidate: true, shouldDirty: true })} />
      {errors.tags && <p className="-mt-4 text-sm text-red-600 dark:text-red-400">{fieldError(errors.tags.message ?? errors.tags[0]?.message)}</p>}

      <div className="flex gap-2">
        <Button onClick={() => router.back()} disabled={busy} className="flex-1">
          {tCommon("cancel")}
        </Button>
        <Button variant="primary" type="submit" pending={busy} className="flex-[2]">
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
