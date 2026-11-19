"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRightLeft, ChevronLeft, ChevronRight, ImageOff, MapPin, Pencil, Tag, Trash2 } from "lucide-react";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { deleteItem, moveItem } from "@/app/(app)/items/actions";
import { LocationPicker } from "@/components/locations/location-picker";
import { PlaceAssistant } from "@/components/locations/place-assistant";
import { useLocations } from "@/components/locations/locations-context";
import { Alert, Button } from "@/components/ui/buttons";
import { Photo } from "@/components/ui/photo";
import { Sheet } from "@/components/ui/sheet";
import type { CategoryOption } from "@/lib/items/data";
import { pickText, type ItemDetail, type ItemPhoto } from "@/lib/items/types";
import { useErrorText } from "@/lib/use-error-text";

function Carousel({ photos, alt }: { photos: ItemPhoto[]; alt: string }) {
  const t = useTranslations("items");
  const ref = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);

  if (photos.length === 0) {
    return (
      <div className="flex aspect-[4/3] w-full items-center justify-center rounded-2xl bg-surface text-muted">
        <ImageOff className="size-10" aria-label={t("noPhoto")} />
      </div>
    );
  }

  const go = (i: number) => {
    const el = ref.current;
    if (el) el.scrollTo({ left: i * el.clientWidth, behavior: "smooth" });
  };

  return (
    <div className="relative">
      <div
        ref={ref}
        onScroll={(e) => {
          const el = e.currentTarget;
          setIndex(Math.round(el.scrollLeft / Math.max(1, el.clientWidth)));
        }}
        className="flex aspect-[4/3] w-full snap-x snap-mandatory overflow-x-auto overscroll-x-contain rounded-2xl bg-surface [scrollbar-width:none]"
        aria-roledescription="carousel"
      >
        {photos.map((p, i) => (
          <div key={p.id} className="h-full w-full shrink-0 snap-center" aria-label={t("photoOf", { n: i + 1, total: photos.length })}>
            {/* Thumbnail first for a fast first paint, the full photo replaces it. */}
            <Photo
              src={p.url ?? p.thumbUrl ?? ""}
              alt={`${alt} — ${t("photoOf", { n: i + 1, total: photos.length })}`}
              loading={i === 0 ? "eager" : "lazy"}
              className="size-full object-contain"
            />
          </div>
        ))}
      </div>
      {photos.length > 1 && (
        <>
          <button
            type="button"
            onClick={() => go(Math.max(0, index - 1))}
            disabled={index === 0}
            aria-label={t("prevPhoto")}
            className="absolute top-1/2 left-1 hidden size-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/40 text-white disabled:opacity-0 sm:flex"
          >
            <ChevronLeft className="size-6" aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => go(Math.min(photos.length - 1, index + 1))}
            disabled={index === photos.length - 1}
            aria-label={t("nextPhoto")}
            className="absolute top-1/2 right-1 hidden size-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/40 text-white disabled:opacity-0 sm:flex"
          >
            <ChevronRight className="size-6" aria-hidden />
          </button>
          <div className="mt-2 flex justify-center gap-1.5" aria-hidden>
            {photos.map((p, i) => (
              <span key={p.id} className={`size-2 rounded-full ${i === index ? "bg-accent" : "bg-border"}`} />
            ))}
          </div>
          <p className="sr-only" aria-live="polite">
            {t("photoOf", { n: index + 1, total: photos.length })}
          </p>
        </>
      )}
    </div>
  );
}

export function ItemView({ item, categories }: { item: ItemDetail; categories: CategoryOption[] }) {
  const t = useTranslations("items");
  const tCommon = useTranslations("common");
  const errorText = useErrorText();
  const format = useFormatter();
  const locale = useLocale();
  const router = useRouter();
  const { byId, path } = useLocations();
  const [dialog, setDialog] = useState<"move" | "delete" | null>(null);
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  const name = pickText(item.nameRu, item.nameEn, locale);
  const description = pickText(item.descriptionRu, item.descriptionEn, locale);
  const place = item.locationId ? byId.get(item.locationId) : undefined;
  const category = categories.find((c) => c.id === item.categoryId);
  const date = (iso: string) => format.dateTime(new Date(iso), { dateStyle: "medium" });

  const move = (locationId: string | null) =>
    startTransition(async () => {
      setDialog(null);
      setError(undefined);
      const result = await moveItem({ id: item.id, location_id: locationId });
      if (!result.ok) setError(result.error);
    });

  const remove = () =>
    startTransition(async () => {
      setError(undefined);
      const result = await deleteItem({ id: item.id });
      if (!result.ok) return setError(result.error);
      router.replace("/");
    });

  return (
    <article className="flex flex-col gap-5">
      <Carousel photos={item.photos} alt={name} />

      <div>
        <h1 className="text-2xl font-semibold tracking-tight break-words">{name}</h1>
        {category && <p className="mt-1 text-muted">{pickText(category.name_ru, category.name_en, locale)}</p>}
      </div>

      {error && <Alert>{errorText(error)}</Alert>}

      <div className="grid grid-cols-3 gap-2">
        <Link
          href={`/items/${item.id}/edit`}
          className="flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-border bg-surface px-2 text-sm font-medium"
        >
          <Pencil className="size-4" aria-hidden />
          {t("edit")}
        </Link>
        <Button onClick={() => setDialog("move")} pending={pending && dialog === null} className="px-2 text-sm">
          <ArrowRightLeft className="size-4" aria-hidden />
          {t("move")}
        </Button>
        <Button onClick={() => setDialog("delete")} className="px-2 text-sm text-red-600 dark:text-red-400">
          <Trash2 className="size-4" aria-hidden />
          {tCommon("delete")}
        </Button>
      </div>

      <dl className="flex flex-col gap-4">
        <div>
          <dt className="text-sm text-muted">{t("place")}</dt>
          <dd>
            {place ? (
              <Link href={`/locations/${place.id}`} className="inline-flex min-h-9 items-start gap-1.5 text-accent">
                <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden />
                <span>{path(place)}</span>
              </Link>
            ) : (
              <span className="text-muted">{t("noPlaceSelected")}</span>
            )}
          </dd>
        </div>
        {description && (
          <div>
            <dt className="text-sm text-muted">{t("description")}</dt>
            <dd className="whitespace-pre-line">{description}</dd>
          </div>
        )}
        {item.tags.length > 0 && (
          <div>
            <dt className="text-sm text-muted">{t("tags")}</dt>
            <dd className="mt-1 flex flex-wrap gap-1.5">
              {item.tags.map((tag) => (
                <span key={tag} className="inline-flex items-center gap-1 rounded-lg bg-surface px-2.5 py-1 text-sm">
                  <Tag className="size-3.5 text-muted" aria-hidden />
                  {tag}
                </span>
              ))}
            </dd>
          </div>
        )}
      </dl>
      <div className="text-sm text-muted">
        <p>{t("created", { date: date(item.createdAt) })}</p>
        {item.updatedAt.slice(0, 19) !== item.createdAt.slice(0, 19) && <p>{t("updated", { date: date(item.updatedAt) })}</p>}
      </div>

      <LocationPicker
        open={dialog === "move"}
        onClose={() => setDialog(null)}
        title={t("moveTitle")}
        initialId={item.locationId}
        allowRoot
        rootLabel={t("noPlaceSelected")}
        onSelect={move}
        extra={<PlaceAssistant mode="move" onPlace={move} />}
      />

      <Sheet
        open={dialog === "delete"}
        onClose={() => setDialog(null)}
        title={t("deleteTitle", { name })}
        footer={
          <div className="flex gap-2">
            <Button onClick={() => setDialog(null)} className="flex-1">
              {tCommon("cancel")}
            </Button>
            <Button variant="danger" onClick={remove} pending={pending} className="flex-1">
              {tCommon("delete")}
            </Button>
          </div>
        }
      >
        <p className="text-muted">{t("deleteConfirm")}</p>
      </Sheet>
    </article>
  );
}
