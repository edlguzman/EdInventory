"use client";

import { useState } from "react";
import { ChevronRight, ScanSearch } from "lucide-react";
import { useTranslations } from "next-intl";
import type { CategoryOption } from "@/lib/items/data";
import { ItemForm, type ItemSeed } from "./item-form";
import { MultiAdd } from "./multi-add";

/**
 * The "Add" screen: the usual form for one item, or "several items in one photo".
 * The multi flow can hand a photo (and what the AI recognized) back to the usual form.
 */
export function AddItem({ userId, categories }: { userId: string; categories: CategoryOption[] }) {
  const t = useTranslations("multi");
  const [view, setView] = useState<{ kind: "single"; seed?: ItemSeed; n: number } | { kind: "multi" }>({ kind: "single", n: 0 });

  if (view.kind === "multi") {
    return (
      <MultiAdd
        userId={userId}
        categories={categories}
        onSingle={(seed) => setView({ kind: "single", seed, n: Date.now() })}
        onCancel={() => setView({ kind: "single", n: Date.now() })}
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {!view.seed && (
        <button
          type="button"
          onClick={() => setView({ kind: "multi" })}
          className="flex min-h-14 items-center gap-3 rounded-xl border border-border bg-surface px-4 py-2 text-left"
        >
          <ScanSearch className="size-6 shrink-0 text-accent" aria-hidden />
          <span className="min-w-0 flex-1">
            <span className="block font-medium">{t("title")}</span>
            <span className="block text-sm text-muted">{t("entryHint")}</span>
          </span>
          <ChevronRight className="size-5 shrink-0 text-muted" aria-hidden />
        </button>
      )}
      <ItemForm key={view.n} mode="create" userId={userId} categories={categories} seed={view.seed} />
    </div>
  );
}
