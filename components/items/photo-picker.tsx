"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, ImagePlus, LoaderCircle, Star, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { MAX_PHOTOS } from "@/lib/photos/paths";
import { processPhoto, UnsupportedImageError } from "@/lib/photos/process";
import { Photo } from "@/components/ui/photo";

/** A photo in the form: either already stored (existing) or processed and waiting for upload (new). */
export type PhotoDraft =
  | { key: string; kind: "existing"; path: string; preview: string | null; url: string | null }
  | { key: string; kind: "new"; main: Blob; thumb: Blob; preview: string };

export function PhotoPicker({
  photos,
  primaryKey,
  onChange,
  onError,
}: {
  photos: PhotoDraft[];
  primaryKey: string | null;
  onChange: (photos: PhotoDraft[], primaryKey: string | null) => void;
  onError: (key: string) => void;
}) {
  const t = useTranslations("items");
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const [processing, setProcessing] = useState(0);
  const free = MAX_PHOTOS - photos.length;

  // Release blob: previews of new photos when they leave the list or the form unmounts.
  const previews = useRef(new Set<string>());
  useEffect(() => {
    const current = new Set(photos.filter((p) => p.kind === "new").map((p) => p.preview));
    for (const url of previews.current) if (!current.has(url)) URL.revokeObjectURL(url);
    previews.current = current;
  }, [photos]);
  useEffect(() => () => previews.current.forEach((url) => URL.revokeObjectURL(url)), []);

  async function addFiles(list: FileList | null) {
    const files = Array.from(list ?? []).slice(0, Math.max(0, free));
    if (list && list.length > free) onError("photoTooMany");
    if (files.length === 0) return;
    setProcessing(files.length);
    const added: PhotoDraft[] = [];
    for (const file of files) {
      try {
        const { main, thumb } = await processPhoto(file);
        added.push({ key: crypto.randomUUID(), kind: "new", main, thumb, preview: URL.createObjectURL(thumb) });
      } catch (error) {
        onError(error instanceof UnsupportedImageError ? "photoUnsupported" : "unknown");
      }
      setProcessing((n) => n - 1);
    }
    const next = [...photos, ...added];
    onChange(next, primaryKey ?? next[0]?.key ?? null);
  }

  function remove(key: string) {
    const next = photos.filter((p) => p.key !== key);
    onChange(next, primaryKey === key ? (next[0]?.key ?? null) : primaryKey);
  }

  const input = (ref: React.RefObject<HTMLInputElement | null>, camera: boolean) => (
    <input
      ref={ref}
      type="file"
      accept="image/*"
      {...(camera ? { capture: "environment" as const } : { multiple: true })}
      className="sr-only"
      tabIndex={-1}
      onChange={(e) => {
        void addFiles(e.target.files);
        e.target.value = ""; // allow picking the same file again
      }}
    />
  );

  return (
    <div className="flex flex-col gap-3">
      {photos.length > 0 && (
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {photos.map((p, i) => {
            const isPrimary = p.key === primaryKey;
            return (
              <li key={p.key} className="relative aspect-square overflow-hidden rounded-xl bg-surface">
                {p.preview && (
                  <Photo src={p.preview} alt={t("photoOf", { n: i + 1, total: photos.length })} className="size-full object-cover" />
                )}
                <button
                  type="button"
                  onClick={() => onChange(photos, p.key)}
                  aria-pressed={isPrimary}
                  aria-label={isPrimary ? t("primary") : t("makePrimary")}
                  className="absolute top-0 left-0 flex size-11 items-start justify-start p-1.5"
                >
                  <span className={`rounded-full p-1 ${isPrimary ? "bg-amber-400 text-white" : "bg-black/45 text-white"}`}>
                    <Star className="size-4" fill={isPrimary ? "currentColor" : "none"} aria-hidden />
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => remove(p.key)}
                  aria-label={t("removePhoto")}
                  className="absolute top-0 right-0 flex size-11 items-start justify-end p-1.5"
                >
                  <span className="rounded-full bg-black/45 p-1 text-white">
                    <Trash2 className="size-4" aria-hidden />
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {processing > 0 && (
        <p role="status" className="flex items-center gap-2 text-sm text-muted">
          <LoaderCircle className="size-4 animate-spin" aria-hidden />
          {t("processing")}
        </p>
      )}

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          disabled={free <= 0 || processing > 0}
          onClick={() => cameraRef.current?.click()}
          className="flex min-h-14 items-center justify-center gap-2 rounded-xl bg-accent px-3 font-semibold text-accent-foreground disabled:opacity-50"
        >
          <Camera className="size-5" aria-hidden />
          {t("takePhoto")}
        </button>
        <button
          type="button"
          disabled={free <= 0 || processing > 0}
          onClick={() => galleryRef.current?.click()}
          className="flex min-h-14 items-center justify-center gap-2 rounded-xl border border-border bg-surface px-3 font-medium disabled:opacity-50"
        >
          <ImagePlus className="size-5" aria-hidden />
          {t("fromGallery")}
        </button>
      </div>
      <p className="text-sm text-muted">{t("photosLimit", { max: MAX_PHOTOS })}</p>
      {input(cameraRef, true)}
      {input(galleryRef, false)}
    </div>
  );
}
