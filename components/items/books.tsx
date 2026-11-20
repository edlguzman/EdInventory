"use client";

import { useId, useState } from "react";
import { BookOpen, LoaderCircle, Search } from "lucide-react";
import { useTranslations } from "next-intl";
import type { UseFormReturn } from "react-hook-form";
import { createCategory } from "@/app/(app)/settings/category-actions";
import { Button } from "@/components/ui/buttons";
import { lookupBook } from "@/lib/books/client";
import { BOOK_AUTHOR_MAX, isBooksCategoryName, normalizeIsbn, type BookLookup } from "@/lib/books/isbn";
import type { CategoryOption } from "@/lib/items/data";
import { useErrorText } from "@/lib/use-error-text";
import type { ItemFieldsInput } from "@/lib/validation/items";

const fieldClass =
  "w-full rounded-xl border border-border bg-surface px-4 py-3 text-base outline-none focus:border-accent aria-invalid:border-red-500";

/** The user's "Books" category (by name, any language) and a way to create it on request. */
export function useBooksCategory(categories: CategoryOption[]) {
  const [created, setCreated] = useState<CategoryOption | null>(null);
  const all = created ? [...categories, created] : categories;
  const booksId = all.find((c) => isBooksCategoryName(c.name_ru) || isBooksCategoryName(c.name_en))?.id ?? null;
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  /** Creates "Книги / Books" (the server keeps only the languages of the data mode). */
  async function create(names: { ru: string; en: string }): Promise<string | null> {
    setPending(true);
    setFailed(false);
    const r = await createCategory({ name_ru: names.ru, name_en: names.en }).catch(() => null);
    setPending(false);
    if (!r?.ok) {
      setFailed(true);
      return null;
    }
    setCreated({ id: r.data.id, name_ru: names.ru, name_en: names.en });
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

/**
 * Author, year and ISBN of a book (one value each, the same in every data language mode),
 * plus "Find by ISBN" (catalogue lookup, not AI) which hands the result to `onFound`.
 */
export function BookFields({
  form,
  onFound,
  disabled,
}: {
  form: UseFormReturn<ItemFieldsInput>;
  onFound: (book: BookLookup) => void;
  disabled?: boolean;
}) {
  const t = useTranslations("books");
  const errorText = useErrorText();
  const id = useId();
  const [looking, setLooking] = useState(false);
  const [note, setNote] = useState<string>();
  const {
    register,
    formState: { errors },
  } = form;

  async function find() {
    const isbn = normalizeIsbn(form.getValues("book_isbn"));
    if (!isbn) return setNote(errorText("isbnInvalid"));
    setLooking(true);
    setNote(undefined);
    const r = await lookupBook(isbn);
    setLooking(false);
    if ("error" in r) return setNote(r.error === "rateLimited" ? t("lookupRateLimited") : errorText(r.error));
    if (!r.book) return setNote(t("notFound"));
    onFound(r.book);
    setNote(t("found"));
  }

  const err = (key?: string) => (key ? <p className="text-sm text-red-600 dark:text-red-400">{errorText(key)}</p> : null);

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
            {...register("book_year")}
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
              {...register("book_isbn")}
            />
            <button
              type="button"
              onClick={() => void find()}
              disabled={looking || disabled}
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
      {note && (
        <p role="status" className="text-sm text-muted">
          {note}
        </p>
      )}
    </fieldset>
  );
}
