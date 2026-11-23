"use client";

import { useId, useRef, useState } from "react";
import { BookOpen, ImageIcon, LoaderCircle, ScanBarcode, Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { useWatch, type UseFormReturn } from "react-hook-form";
import { createCategory } from "@/app/(app)/settings/category-actions";
import { useDataLang } from "@/components/data-lang/context";
import { Button } from "@/components/ui/buttons";
import { readIsbn } from "@/lib/ai/client";
import { findIsbnBarcode } from "@/lib/books/barcode";
import type { BookLookupError } from "@/lib/books/client";
import { BOOK_AUTHOR_MAX, formatIsbn, isBooksCategoryName, normalizeIsbn } from "@/lib/books/isbn";
import { processPhoto, UnsupportedImageError } from "@/lib/photos/process";
import type { CategoryOption } from "@/lib/items/data";
import { useErrorText } from "@/lib/use-error-text";
import type { ItemFieldsInput } from "@/lib/validation/items";

const fieldClass =
  "w-full rounded-xl border border-border bg-surface px-4 py-3 text-base outline-none focus:border-accent aria-invalid:border-red-500";

/** The user's "Books" category (by name, any language) and a way to create it on request. */
export function useBooksCategory(categories: CategoryOption[]) {
  const { mode } = useDataLang();
  const [created, setCreated] = useState<CategoryOption | null>(null);
  const all = created ? [...categories, created] : categories;
  const booksId = all.find((c) => isBooksCategoryName(c.name_local) || isBooksCategoryName(c.name_en))?.id ?? null;
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  /** Creates "Книги / Books" (the server keeps only the languages of the data mode). */
  async function create(names: { local: string; en: string }): Promise<string | null> {
    setPending(true);
    setFailed(false);
    const r = await createCategory({ name_local: names.local, name_en: names.en }).catch(() => null);
    setPending(false);
    if (!r?.ok) {
      setFailed(true);
      return null;
    }
    // What the server keeps: English only for English users.
    setCreated({ id: r.data.id, name_local: mode === "en" ? null : names.local, name_en: names.en });
    return r.data.id;
  }
  return { categories: all, booksId, create, pending, failed };
}

/** "This is a book, but there is no Books category: create it?" */
export function BooksCategoryCard({
  pending,
  failed,
  many = false,
  onCreate,
  onDismiss,
}: {
  pending: boolean;
  /** Several items (a shelf): "there are books here". */
  many?: boolean;
  failed: boolean;
  onCreate: () => void;
  onDismiss: () => void;
}) {
  const t = useTranslations("books");
  return (
    <div role="status" className="flex flex-col gap-2 rounded-2xl border border-accent bg-surface p-3">
      <p className="flex items-start gap-2 text-sm">
        <BookOpen className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />
        {many ? t("createCategoryQuestionMany") : t("createCategoryQuestion")}
      </p>
      {failed && <p className="text-sm text-red-600 dark:text-red-400">{t("createCategoryFailed")}</p>}
      <div className="flex gap-2">
        <Button onClick={onDismiss} disabled={pending} className="flex-1">
          {t("notNow")}
        </Button>
        <Button variant="primary" onClick={onCreate} pending={pending} className="flex-1">
          {t("createCategory")}
        </Button>
      </div>
    </div>
  );
}

/** What looking a book up by an ISBN gave (the parent fills the form and searches a cover). */
export type IsbnOutcome = "found" | "notFound" | BookLookupError;

/**
 * Author, year and ISBN of a book (one value each, the same in every data language mode), and
 * three ways to the catalogues (no AI unless said): "Find by ISBN" for a typed number (checksum
 * checked as soon as the field is left), "Scan ISBN" (a photo of the back cover or the copyright
 * page: barcode on the phone first; without one the AI reads the printed "ISBN …" — 1 request;
 * the photo is only read, never stored) and "Find cover" for the ISBN in the field.
 */
export function BookFields({
  form,
  onIsbn,
  onFindCover,
  coverBusy,
  disabled,
  aiOff,
}: {
  form: UseFormReturn<ItemFieldsInput>;
  onIsbn: (isbn: string) => Promise<IsbnOutcome>;
  onFindCover: () => void;
  coverBusy: boolean;
  disabled?: boolean;
  aiOff: boolean;
}) {
  const t = useTranslations("books");
  const errorText = useErrorText();
  const id = useId();
  const scanRef = useRef<HTMLInputElement>(null);
  const [looking, setLooking] = useState(false);
  const [scanning, setScanning] = useState<"barcode" | "ai" | null>(null);
  const [choices, setChoices] = useState<string[] | null>(null);
  const [note, setNote] = useState<string>();
  const {
    register,
    control,
    formState: { errors },
  } = form;
  const isbnValue = useWatch({ control, name: "book_isbn" });
  const validIsbn = normalizeIsbn(isbnValue ?? "");

  /** An ISBN found or typed: the parent looks it up, fills empty fields and searches a cover. */
  async function applyIsbn(isbn: string) {
    setChoices(null);
    setLooking(true);
    setNote(undefined);
    const r = await onIsbn(isbn);
    setLooking(false);
    setNote(r === "found" ? t("found") : r === "notFound" ? t("notFoundIsbnKept") : r === "rateLimited" ? t("lookupRateLimited") : errorText(r));
  }

  async function find() {
    const isbn = normalizeIsbn(form.getValues("book_isbn") ?? "");
    if (!isbn) {
      void form.trigger("book_isbn");
      return setNote(errorText("isbnInvalid"));
    }
    await applyIsbn(isbn);
  }

  /** Scan: barcode on the phone; else the AI reads the printed number (one request). */
  async function scan(file: File) {
    setNote(undefined);
    setChoices(null);
    setScanning("barcode");
    try {
      const { main } = await processPhoto(file);
      // The picked file first (full resolution), then the reduced copy.
      let isbn = (await findIsbnBarcode(file)) ?? (await findIsbnBarcode(main));
      if (!isbn) {
        if (aiOff) return setNote(t("scanNoBarcodeAiOff"));
        setScanning("ai");
        const r = await readIsbn(main);
        if ("error" in r) return setNote(errorText(r.error));
        if (r.isbns.length === 0) return setNote(t("scanNothing"));
        if (r.isbns.length > 1) return setChoices(r.isbns);
        isbn = r.isbns[0];
      }
      setScanning(null);
      await applyIsbn(isbn);
    } catch (e) {
      setNote(errorText(e instanceof UnsupportedImageError ? "photoUnsupported" : "unknown"));
    } finally {
      setScanning(null);
    }
  }

  const err = (key?: string) => (key ? <p className="text-sm text-red-600 dark:text-red-400">{errorText(key)}</p> : null);
  const small = "inline-flex min-h-11 items-center gap-1.5 rounded-xl px-2 text-sm font-medium text-accent disabled:opacity-40";
  const busy = looking || scanning !== null;

  return (
    <fieldset className="flex flex-col gap-3 rounded-2xl border border-border p-3">
      <legend className="flex items-center gap-1.5 px-1 text-sm font-medium">
        <BookOpen className="size-4 text-accent" aria-hidden />
        {t("title")}
      </legend>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-author`} className="text-sm font-medium">
          {t("author")}
        </label>
        <input
          id={`${id}-author`}
          maxLength={BOOK_AUTHOR_MAX}
          autoComplete="off"
          aria-invalid={errors.book_author ? true : undefined}
          className={fieldClass}
          {...register("book_author")}
        />
        {err(errors.book_author?.message)}
      </div>
      <div className="grid grid-cols-[6.5rem_1fr] gap-2">
        <div className="flex min-w-0 flex-col gap-1.5">
          <label htmlFor={`${id}-year`} className="text-sm font-medium">
            {t("year")}
          </label>
          <input
            id={`${id}-year`}
            inputMode="numeric"
            maxLength={4}
            autoComplete="off"
            aria-invalid={errors.book_year ? true : undefined}
            className={fieldClass}
            {...register("book_year", { onBlur: () => void form.trigger("book_year") })}
          />
        </div>
        <div className="flex min-w-0 flex-col gap-1.5">
          <label htmlFor={`${id}-isbn`} className="text-sm font-medium">
            ISBN
          </label>
          <div className="flex gap-1">
            <input
              id={`${id}-isbn`}
              inputMode="numeric"
              maxLength={20}
              autoComplete="off"
              aria-invalid={errors.book_isbn ? true : undefined}
              className={`${fieldClass} min-w-0`}
              // Checksum checked as soon as the field is left, not only on saving.
              {...register("book_isbn", { onBlur: () => void form.trigger("book_isbn") })}
            />
            <button
              type="button"
              onClick={() => void find()}
              disabled={busy || disabled}
              aria-label={t("findByIsbn")}
              title={t("findByIsbn")}
              className="flex size-12 shrink-0 items-center justify-center rounded-xl border border-border text-accent disabled:opacity-40"
            >
              {looking ? <LoaderCircle className="size-5 animate-spin" aria-hidden /> : <Search className="size-5" aria-hidden />}
            </button>
          </div>
        </div>
      </div>
      {err(errors.book_year?.message)}
      {err(errors.book_isbn?.message)}

      <div className="-my-1 flex flex-wrap items-center gap-x-2">
        <button type="button" className={`${small} -ml-2`} disabled={busy || disabled} onClick={() => scanRef.current?.click()}>
          {scanning ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <ScanBarcode className="size-4" aria-hidden />}
          {scanning === "ai" ? t("scanReading") : scanning ? t("scanLooking") : t("scanIsbn")}
        </button>
        <button type="button" className={small} disabled={!validIsbn || coverBusy || busy || disabled} onClick={onFindCover}>
          {coverBusy ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <ImageIcon className="size-4" aria-hidden />}
          {t("findCover")}
        </button>
        <input
          ref={scanRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) void scan(file);
          }}
        />
      </div>
      <p className="-mt-2 text-xs text-muted">{t("scanHint")}</p>

      {choices && (
        <div role="group" aria-label={t("whichIsbn")} className="flex flex-col gap-1 rounded-xl bg-surface p-2">
          <p className="px-1 text-sm font-medium">{t("whichIsbn")}</p>
          {choices.map((isbn) => (
            <button key={isbn} type="button" onClick={() => void applyIsbn(isbn)} className="min-h-11 rounded-lg px-2 text-left tabular-nums active:bg-background">
              {formatIsbn(isbn)}
            </button>
          ))}
        </div>
      )}
      {note && (
        <p role="status" className="text-sm text-muted">
          {note}
        </p>
      )}
    </fieldset>
  );
}

export type CoverChoice = "main" | "second" | "none";

/**
 * A cover found in a catalogue: "Make it the main photo", "Add as the second photo", "Not needed".
 * The choice shows at once in the photo row; nothing is uploaded before "Save".
 */
export function CoverOffer({
  preview,
  source,
  choice,
  noRoom,
  onChoose,
}: {
  preview: string;
  source: "google" | "openlibrary";
  choice: CoverChoice;
  /** 10 photos already: it can only be "not needed". */
  noRoom: boolean;
  onChoose: (choice: CoverChoice) => void;
}) {
  const t = useTranslations("books");
  const options: [CoverChoice, string][] = [
    ["main", t("coverMain")],
    ["second", t("coverSecond")],
    ["none", t("coverNone")],
  ];
  return (
    <div className="flex gap-3 rounded-2xl border border-accent bg-surface p-3">
      {/* eslint-disable-next-line @next/next/no-img-element -- a local blob preview */}
      <img src={preview} alt={t("coverAlt")} className="h-28 w-20 shrink-0 rounded-lg bg-background object-contain" />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="text-sm font-medium">{t("coverFound", { source: source === "google" ? "Google Books" : "Open Library" })}</p>
        <div role="radiogroup" aria-label={t("coverFound", { source: "" })} className="flex flex-col">
          {options.map(([value, label]) => {
            const off = noRoom && value !== "none";
            return (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={choice === value}
                disabled={off}
                onClick={() => onChoose(value)}
                className="flex min-h-11 items-center gap-2 text-left text-sm disabled:opacity-40"
              >
                <span
                  aria-hidden
                  className={`flex size-5 shrink-0 items-center justify-center rounded-full border-2 ${choice === value ? "border-accent" : "border-border"}`}
                >
                  {choice === value && <span className="size-2.5 rounded-full bg-accent" />}
                </span>
                {label}
              </button>
            );
          })}
        </div>
        {noRoom && <p className="text-xs text-muted">{t("coverNoRoom")}</p>}
      </div>
    </div>
  );
}
