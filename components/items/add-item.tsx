"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, ImagePlus, LoaderCircle, Package, ScanSearch, type LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useOffline } from "@/components/offline-banner";
import { Alert } from "@/components/ui/buttons";
import type { CategoryOption } from "@/lib/items/data";
import { MAX_PHOTOS } from "@/lib/photos/paths";
import { setBackOverride } from "@/lib/nav-history";
import { fileHash } from "@/lib/photos/hash";
import { processPhoto, UnsupportedImageError } from "@/lib/photos/process";
import { useErrorText } from "@/lib/use-error-text";
import { ItemForm, type ItemSeed } from "./item-form";
import { MultiAdd } from "./multi-add";

type View =
  | { kind: "choose" }
  | { kind: "single"; seed: ItemSeed; n: number }
  | { kind: "multi"; file: File; n: number };

/**
 * The "Add" screen. Until a photo is picked it shows only two equal cards:
 * "Several items in one photo" and "One item", each with "Take photo" / "From gallery".
 * The picked photo then opens the matching flow; the multi flow can hand a photo
 * (and what the AI recognized) over to the usual form.
 */
export function AddItem({ userId, categories }: { userId: string; categories: CategoryOption[] }) {
  const [view, setView] = useState<View>({ kind: "choose" });
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string>();
  const errorText = useErrorText();
  const back = () => setView({ kind: "choose" });

  // The header's back arrow: from the one-item form back to the two cards. In "several items"
  // the multi screen takes the arrow itself (it may ask before throwing found items away).
  useEffect(() => {
    if (view.kind !== "single") return;
    setBackOverride(() => setView({ kind: "choose" }));
    return () => setBackOverride(null);
  }, [view.kind]);

  /** One item: process the picked photos as the form would, then open the form with them. */
  async function pickSingle(files: File[]) {
    if (files.length === 0) return;
    setError(undefined);
    if (files.length > MAX_PHOTOS) setError("photoTooMany");
    setProcessing(true);
    const photos: ItemSeed["photos"] = [];
    for (const file of files.slice(0, MAX_PHOTOS)) {
      try {
        const [photo, hash] = await Promise.all([processPhoto(file), fileHash(file)]);
        photos.push({ ...photo, hash });
      } catch (e) {
        setError(e instanceof UnsupportedImageError ? "photoUnsupported" : "unknown");
      }
    }
    setProcessing(false);
    if (photos.length > 0) setView({ kind: "single", seed: { photos, recognition: null }, n: Date.now() });
  }

  if (view.kind === "multi") {
    return (
      <MultiAdd
        key={view.n}
        initialFile={view.file}
        userId={userId}
        categories={categories}
        onSingle={(seed) => setView({ kind: "single", seed, n: Date.now() })}
        onCancel={back}
      />
    );
  }

  if (view.kind === "single") {
    return <ItemForm key={view.n} mode="create" userId={userId} categories={categories} seed={view.seed} onCancel={back} />;
  }

  return (
    <div className="flex flex-col gap-4">
      {error && <Alert>{errorText(error)}</Alert>}
      <ChoiceCard
        icon={ScanSearch}
        ns="multi"
        multiple={false}
        disabled={processing}
        onFiles={(files) => files[0] && setView({ kind: "multi", file: files[0], n: Date.now() })}
      />
      <ChoiceCard icon={Package} ns="single" multiple disabled={processing} busy={processing} onFiles={(files) => void pickSingle(files)} />
    </div>
  );
}

/** One of the two equal cards: icon, title, one line of explanation, camera and gallery buttons. */
function ChoiceCard({
  icon: Icon,
  ns,
  multiple,
  disabled,
  busy = false,
  onFiles,
}: {
  icon: LucideIcon;
  ns: "multi" | "single";
  multiple: boolean;
  disabled: boolean;
  busy?: boolean;
  onFiles: (files: File[]) => void;
}) {
  const t = useTranslations("addChoice");
  const tItems = useTranslations("items");
  const offline = useOffline();
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const off = disabled || (ns === "multi" && offline); // finding items needs the AI

  const input = (ref: React.RefObject<HTMLInputElement | null>, camera: boolean) => (
    <input
      ref={ref}
      type="file"
      accept="image/*"
      {...(camera ? { capture: "environment" as const } : { multiple })}
      className="sr-only"
      tabIndex={-1}
      onChange={(e) => {
        onFiles(Array.from(e.target.files ?? []));
        e.target.value = "";
      }}
    />
  );

  return (
    <section aria-labelledby={`add-${ns}`} className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-4">
      <div className="flex items-start gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent">
          <Icon className="size-6" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id={`add-${ns}`} className="font-semibold">
            {t(`${ns}.title`)}
          </h2>
          <p className="text-sm text-muted">{t(`${ns}.hint`)}</p>
        </div>
      </div>
      {busy ? (
        <p role="status" className="flex min-h-14 items-center justify-center gap-2 text-sm text-muted">
          <LoaderCircle className="size-4 animate-spin" aria-hidden />
          {tItems("processing")}
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            disabled={off}
            onClick={() => cameraRef.current?.click()}
            className="flex min-h-14 items-center justify-center gap-2 rounded-xl bg-accent px-3 font-semibold text-accent-foreground disabled:opacity-50"
          >
            <Camera className="size-5" aria-hidden />
            {tItems("takePhoto")}
          </button>
          <button
            type="button"
            disabled={off}
            onClick={() => galleryRef.current?.click()}
            className="flex min-h-14 items-center justify-center gap-2 rounded-xl border border-border bg-background px-3 font-medium disabled:opacity-50"
          >
            <ImagePlus className="size-5" aria-hidden />
            {tItems("fromGallery")}
          </button>
        </div>
      )}
      {input(cameraRef, true)}
      {input(galleryRef, false)}
    </section>
  );
}
