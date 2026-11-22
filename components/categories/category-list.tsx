"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { createCategory, deleteCategory, renameCategory } from "@/app/(app)/settings/category-actions";
import { useDataLang } from "@/components/data-lang/context";
import { TranslateRecordButton } from "@/components/data-lang/translate-record-button";
import { NameFields } from "@/components/name-fields";
import { Alert, Button } from "@/components/ui/buttons";
import { Sheet } from "@/components/ui/sheet";
import { pickText } from "@/lib/data-lang";
import { useErrorText } from "@/lib/use-error-text";
import { CATEGORY_NAME_MAX, categoryNamesSchema, type NamePairInput } from "@/lib/validation/names";

export type Category = { id: string; name_local: string | null; name_en: string | null };

type Dialog = { kind: "create" } | { kind: "edit"; category: Category } | { kind: "delete"; category: Category };

export function CategoryList({ categories }: { categories: Category[] }) {
  const t = useTranslations("categories");
  const tCommon = useTranslations("common");
  const { display: locale, mode } = useDataLang();
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const close = () => setDialog(null);
  const label = (c: Category) => pickText(c.name_local, c.name_en, locale);
  // The second line (English) only with English shown next to my language.
  const other = (c: Category) => (mode === "local_en" && c.name_local ? c.name_en : null);

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-medium text-muted">{t("title")}</h2>
        <Button variant="ghost" onClick={() => setDialog({ kind: "create" })} className="-mr-3">
          <Plus className="size-5" aria-hidden />
          {t("add")}
        </Button>
      </div>
      {categories.length === 0 ? (
        <p className="text-muted">{t("empty")}</p>
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border">
          {categories.map((c) => (
            <li key={c.id} className="flex items-center gap-1 py-1 pl-4">
              <div className="min-w-0 flex-1">
                <p className="truncate">{label(c)}</p>
                {other(c) && other(c) !== label(c) && <p className="truncate text-sm text-muted">{other(c)}</p>}
              </div>
              <TranslateRecordButton type="category" id={c.id} texts={c} compact />
              <button
                type="button"
                onClick={() => setDialog({ kind: "edit", category: c })}
                aria-label={`${tCommon("edit")}: ${label(c)}`}
                className="flex size-11 items-center justify-center rounded-xl text-muted"
              >
                <Pencil className="size-5" aria-hidden />
              </button>
              <button
                type="button"
                onClick={() => setDialog({ kind: "delete", category: c })}
                aria-label={`${tCommon("delete")}: ${label(c)}`}
                className="flex size-11 items-center justify-center rounded-xl text-red-600 dark:text-red-400"
              >
                <Trash2 className="size-5" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}

      {dialog?.kind === "create" && <CategoryFormSheet onClose={close} />}
      {dialog?.kind === "edit" && <CategoryFormSheet category={dialog.category} onClose={close} />}
      {dialog?.kind === "delete" && <DeleteCategorySheet category={dialog.category} name={label(dialog.category)} onClose={close} />}
    </section>
  );
}

function CategoryFormSheet({ category, onClose }: { category?: Category; onClose: () => void }) {
  const t = useTranslations("categories");
  const tCommon = useTranslations("common");
  const errorText = useErrorText();
  const { mode } = useDataLang();
  const foreign = mode !== "en" && !!category && !category.name_local;
  const [error, setError] = useState<string>();
  const form = useForm<NamePairInput>({
    // A category not in my language (no own-language name) is edited through English.
    resolver: zodResolver(categoryNamesSchema(mode, foreign)),
    defaultValues: { name_local: category?.name_local ?? "", name_en: category?.name_en ?? "" },
  });

  const submit = form.handleSubmit(async (names) => {
    setError(undefined);
    const result = category ? await renameCategory({ ...names, id: category.id }) : await createCategory(names);
    if (!result.ok) return setError(result.error);
    onClose();
  });

  return (
    <Sheet
      open
      onClose={onClose}
      title={category ? t("editTitle") : t("createTitle")}
      footer={
        <div className="flex gap-2">
          <Button onClick={onClose} className="flex-1">
            {tCommon("cancel")}
          </Button>
          <Button variant="primary" type="submit" form="category-form" pending={form.formState.isSubmitting} className="flex-1">
            {tCommon("save")}
          </Button>
        </div>
      }
    >
      <form id="category-form" onSubmit={submit} noValidate className="flex flex-col gap-4">
        {error && <Alert>{errorText(error)}</Alert>}
        <NameFields form={form} max={CATEGORY_NAME_MAX} foreign={foreign} />
      </form>
    </Sheet>
  );
}

function DeleteCategorySheet({ category, name, onClose }: { category: Category; name: string; onClose: () => void }) {
  const t = useTranslations("categories");
  const tCommon = useTranslations("common");
  const errorText = useErrorText();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();

  const confirm = () =>
    startTransition(async () => {
      setError(undefined);
      const result = await deleteCategory({ id: category.id });
      if (!result.ok) return setError(result.error);
      onClose();
    });

  return (
    <Sheet
      open
      onClose={onClose}
      title={t("deleteTitle", { name })}
      footer={
        <div className="flex gap-2">
          <Button onClick={onClose} className="flex-1">
            {tCommon("cancel")}
          </Button>
          <Button variant="danger" onClick={confirm} pending={pending} className="flex-1">
            {tCommon("delete")}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-3">
        {error && <Alert>{errorText(error)}</Alert>}
        <p className="text-muted">{t("deleteConfirm")}</p>
      </div>
    </Sheet>
  );
}
