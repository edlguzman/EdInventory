"use client";

import { useMemo, useState } from "react";
import { ChevronRight, Home, Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { matchesAllTokens, searchTokens } from "@/lib/search";
import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/buttons";
import { useLocations } from "./locations-context";

type Props = {
  open: boolean;
  onClose: () => void;
  onSelect: (id: string | null) => void;
  title?: string;
  /** Where browsing starts (usually the current value). */
  initialId?: string | null;
  /** Hide this place and everything inside it (for "move"). */
  excludeId?: string;
  /** Offer "Top level" (parent = null). */
  allowRoot?: boolean;
};

/**
 * Place picker: browse the tree (tap a row to go inside, then "Choose")
 * or type words of the path in any language ("garage rack", "гараж стеллаж").
 */
export function LocationPicker(props: Props) {
  // Remount on every opening, so the state starts fresh.
  return props.open ? <PickerSheet key={`${props.initialId ?? ""}`} {...props} /> : null;
}

function PickerSheet({ onClose, onSelect, title, initialId = null, excludeId, allowRoot = false }: Props) {
  const t = useTranslations("locations");
  const { all, byId, childrenOf, subtreeIds, name, path, locale } = useLocations();
  const excluded = useMemo(() => (excludeId ? subtreeIds(excludeId) : new Set<string>()), [excludeId, subtreeIds]);

  const start = initialId && byId.has(initialId) && !excluded.has(initialId) ? initialId : null;
  const [cursor, setCursor] = useState<string | null>(start);
  const [query, setQuery] = useState("");
  const tokens = useMemo(() => searchTokens(query), [query]);

  const current = cursor ? byId.get(cursor) : undefined;
  const crumbs = current ? current.idPath.map((id) => byId.get(id)).filter((l) => l !== undefined) : [];

  const results = useMemo(() => {
    if (tokens.length === 0) return [];
    const collator = new Intl.Collator(locale, { sensitivity: "base", numeric: true });
    return all
      .filter((l) => !excluded.has(l.id) && matchesAllTokens(`${l.pathRu} ${l.pathEn}`, tokens))
      .sort((a, b) => collator.compare(path(a), path(b)))
      .slice(0, 50);
  }, [tokens, all, excluded, locale, path]);

  const rows = childrenOf(cursor).filter((l) => !excluded.has(l.id));

  const footer =
    tokens.length > 0 ? undefined : current ? (
      <Button variant="primary" className="w-full" onClick={() => onSelect(current.id)}>
        <span className="truncate">{t("pickerChoose", { name: name(current) })}</span>
      </Button>
    ) : allowRoot ? (
      <Button variant="primary" className="w-full" onClick={() => onSelect(null)}>
        {t("topLevel")}
      </Button>
    ) : undefined;

  return (
    <Sheet open onClose={onClose} title={title ?? t("pickerTitle")} footer={footer}>
      <div className="relative mb-3">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-muted" aria-hidden />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("pickerSearch")}
          aria-label={t("pickerSearch")}
          className="min-h-12 w-full rounded-xl border border-border bg-surface pr-4 pl-10 text-base outline-none focus:border-accent"
        />
      </div>

      {tokens.length > 0 ? (
        results.length === 0 ? (
          <p className="py-6 text-center text-muted">{t("pickerNoResults")}</p>
        ) : (
          <ul className="flex flex-col">
            {results.map((l) => (
              <li key={l.id}>
                <button
                  type="button"
                  onClick={() => onSelect(l.id)}
                  className="flex min-h-12 w-full items-center rounded-xl px-3 text-left active:bg-surface"
                >
                  <span className="line-clamp-2">{path(l)}</span>
                </button>
              </li>
            ))}
          </ul>
        )
      ) : (
        <>
          <nav aria-label={t("allPlaces")} className="mb-2 flex flex-wrap items-center gap-x-1 text-sm">
            <button
              type="button"
              onClick={() => setCursor(null)}
              className={`inline-flex min-h-10 items-center gap-1 rounded-lg px-2 ${cursor ? "text-accent" : "font-medium"}`}
            >
              <Home className="size-4" aria-hidden />
              {t("allPlaces")}
            </button>
            {crumbs.map((c, i) => (
              <span key={c.id} className="inline-flex items-center gap-1">
                <ChevronRight className="size-4 text-muted" aria-hidden />
                <button
                  type="button"
                  onClick={() => setCursor(c.id)}
                  aria-current={i === crumbs.length - 1 ? "location" : undefined}
                  className={`min-h-10 rounded-lg px-2 ${i === crumbs.length - 1 ? "font-medium" : "text-accent"}`}
                >
                  {name(c)}
                </button>
              </span>
            ))}
          </nav>

          {rows.length === 0 ? (
            <p className="py-6 text-center text-muted">{t("pickerEmpty")}</p>
          ) : (
            <ul className="flex flex-col">
              {rows.map((l) => {
                const nested = childrenOf(l.id).filter((c) => !excluded.has(c.id)).length;
                return (
                  <li key={l.id}>
                    <button
                      type="button"
                      onClick={() => setCursor(l.id)}
                      aria-label={t("pickerOpen", { name: name(l) })}
                      className="flex min-h-12 w-full items-center gap-2 rounded-xl px-3 text-left active:bg-surface"
                    >
                      <span className="min-w-0 flex-1 truncate">{name(l)}</span>
                      {nested > 0 && <span className="text-sm text-muted">{nested}</span>}
                      <ChevronRight className="size-5 text-muted" aria-hidden />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </Sheet>
  );
}
