"use client";

import { useDataLang } from "@/components/data-lang/context";
import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { CheckSquare, LoaderCircle, MapPin, Search, Sparkles, Tag, X } from "lucide-react";
import { useHelpTopic } from "@/components/help/help-sheet";
import { useTranslations } from "next-intl";
import { BulkBar, UndoToast } from "@/components/items/bulk-bar";
import { ItemTable } from "@/components/items/item-list";
import { SelectionHeader, useItemSelection } from "@/components/items/selection";
import { useLocations } from "@/components/locations/locations-context";
import { Alert, Button } from "@/components/ui/buttons";
import { useAiOff, usePlanLimitText } from "@/components/plan-context";
import { useOffline } from "@/components/offline-banner";
import { MicButton, RecordingStatus } from "@/components/voice-input";
import { askSearch } from "@/lib/ai/client";
import { loadMoreResults, selectAllResults } from "@/app/(app)/search/actions";
import type { SearchResult } from "@/lib/ai/types";
import { useVoiceRecorder } from "@/lib/audio/use-voice-recorder";
import type { CategoryOption } from "@/lib/items/data";
import { pickText, type ItemSummary } from "@/lib/items/types";
import { useErrorText } from "@/lib/use-error-text";

type AiState = { terms: string[]; location: string | null; category: string | null } | null;

function aiUrl(pathname: string, r: SearchResult) {
  const p = new URLSearchParams({ ai: "1", q: r.transcript, t: r.terms.join(",") });
  if (r.location_id) p.set("loc", r.location_id);
  if (r.category_id) p.set("cat", r.category_id);
  return `${pathname}?${p}`;
}

export function SearchView({
  q,
  ai,
  results: firstPage,
  total,
  query,
  categories,
}: {
  q: string;
  ai: AiState;
  results: ItemSummary[] | null;
  /** All results of this search (the page shows the first ones and loads more). */
  total: number;
  /** What the server searched for: the same for the next pages and "Select all found". */
  query: { terms: string[]; location: string | null; category: string | null };
  categories: CategoryOption[];
}) {
  const t = useTranslations("search");
  const tItems = useTranslations("items");
  const errorText = useErrorText();
  const { display: locale } = useDataLang();
  const router = useRouter();
  const pathname = usePathname();
  const { byId, path } = useLocations();
  const [text, setText] = useState(q);
  const tBulk = useTranslations("bulk");
  // Bulk edit of the results: "Select all found" = all results of this search.
  const selection = useItemSelection();
  // "?" in selection mode: "Many items at once".
  useHelpTopic("bulk", selection.active);
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string>();
  const [navigating, startNavigation] = useTransition();
  const typed = useRef(false);

  // Next pages ("Show more"), for this exact search only: a new search starts over.
  const searchKey = `${query.terms.join("")}|${query.location}|${query.category}|${firstPage?.[0]?.id ?? ""}`;
  const [more, setMore] = useState<{ key: string; items: ItemSummary[] }>({ key: "", items: [] });
  const [loadingMore, setLoadingMore] = useState(false);
  const [selectingAll, setSelectingAll] = useState(false);
  const extra = more.key === searchKey ? more.items : [];
  const results = firstPage === null ? null : extra.length ? [...firstPage, ...extra] : firstPage;
  const moreToLoad = results !== null && results.length < total;

  async function loadMore() {
    if (!results || loadingMore) return;
    setLoadingMore(true);
    const r = await loadMoreResults({ ...query, offset: results.length }).catch(() => null);
    setLoadingMore(false);
    if (!r) return setError("unknown");
    const seen = new Set(results.map((x) => x.id));
    setMore({ key: searchKey, items: [...extra, ...r.items.filter((x) => !seen.has(x.id))] });
  }

  /** Every result of this search, not only the loaded pages (the first 500). */
  async function selectAllFound() {
    if (!results) return;
    if (results.length >= total) return selection.selectAll(results.map((r) => r.id), results.length);
    setSelectingAll(true);
    const r = await selectAllResults(query).catch(() => null);
    setSelectingAll(false);
    if (!r) return setError("unknown");
    selection.selectAll(r.ids, r.total);
  }

  // Instant search without AI: update the URL shortly after typing stops.
  useEffect(() => {
    if (!typed.current) return;
    const id = setTimeout(() => {
      const value = text.trim();
      startNavigation(() => router.replace(value ? `${pathname}?q=${encodeURIComponent(value)}` : pathname, { scroll: false }));
    }, 350);
    return () => clearTimeout(id);
  }, [text, pathname, router]);

  async function ask(input: { audio?: Blob; text?: string }) {
    setError(undefined);
    setAsking(true);
    const r = await askSearch(input);
    setAsking(false);
    if ("error" in r) return setError(r.error);
    if (r.terms.length === 0) return setError("aiNoTerms");
    typed.current = false;
    setText(r.transcript);
    startNavigation(() => router.push(aiUrl(pathname, r)));
  }

  const recorder = useVoiceRecorder({ onAudio: (audio) => void ask({ audio }), onError: setError });
  const busy = asking || recorder.converting;
  const offline = useOffline();
  const aiOff = useAiOff();
  const limitText = usePlanLimitText();

  // Removing an AI filter keeps the same question and terms.
  const without = (key: "loc" | "cat") => {
    const p = new URLSearchParams({ ai: "1", q, t: ai?.terms.join(",") ?? "" });
    if (key !== "loc" && ai?.location) p.set("loc", ai.location);
    if (key !== "cat" && ai?.category) p.set("cat", ai.category);
    return `${pathname}?${p}`;
  };
  const place = ai?.location ? byId.get(ai.location) : undefined;
  const category = ai?.category ? categories.find((c) => c.id === ai.category) : undefined;

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>

      <div className="flex items-center gap-2">
        {recorder.recording ? (
          <RecordingStatus seconds={recorder.seconds} />
        ) : (
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-muted" aria-hidden />
            <input
              type="search"
              value={text}
              onChange={(e) => {
                typed.current = true;
                setText(e.target.value);
              }}
              placeholder={t("placeholder")}
              aria-label={t("title")}
              maxLength={500}
              enterKeyHint="search"
              className="min-h-12 w-full rounded-xl border border-border bg-surface pr-4 pl-10 text-base outline-none focus:border-accent"
            />
          </div>
        )}
        <MicButton recorder={recorder} busy={asking} />
      </div>

      {text.trim() && !recorder.recording && !(ai && text.trim() === q) && (
        <Button onClick={() => void ask({ text: text.trim() })} pending={asking} disabled={offline || aiOff} title={limitText} className="self-start">
          {!asking && <Sparkles className="size-4 text-accent" aria-hidden />}
          {asking ? t("asking") : t("askAi")}
        </Button>
      )}
      {!text.trim() && !recorder.recording && <p className="text-sm text-muted">{t("hint")}</p>}
      {error && <Alert tone={error === "aiNoTerms" ? "warning" : "error"}>{errorText(error)}</Alert>}

      {ai && (
        <section aria-label={t("aiSection")} className="flex flex-col gap-2 rounded-xl bg-surface p-3 text-sm">
          <p>
            <Sparkles className="mr-1 inline size-4 text-accent" aria-hidden />
            {t("youAsked")} <q className="font-medium">{q}</q>
          </p>
          {(place || category) && (
            <div className="flex flex-wrap gap-2">
              {place && (
                <Link href={without("loc")} className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-accent px-2 text-accent">
                  <MapPin className="size-4" aria-hidden />
                  {path(place)}
                  <X className="size-4" aria-label={t("removeFilter")} />
                </Link>
              )}
              {category && (
                <Link href={without("cat")} className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-accent px-2 text-accent">
                  <Tag className="size-4" aria-hidden />
                  {pickText(category.name_local, category.name_en, locale)}
                  <X className="size-4" aria-label={t("removeFilter")} />
                </Link>
              )}
            </div>
          )}
          <p className="text-muted">
            {t("searchedFor")} {ai.terms.join(", ")}
          </p>
        </section>
      )}

      {(navigating || busy) && results === null && (
        <p role="status" className="flex items-center gap-2 text-sm text-muted">
          <LoaderCircle className="size-4 animate-spin" aria-hidden />
          {t("searching")}
        </p>
      )}

      {results !== null &&
        (results.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border p-6 text-center text-muted">
            {ai ? t("nothingAi") : t("nothing")}
          </p>
        ) : (
          <div className={`flex flex-col gap-2 ${navigating ? "opacity-60 transition-opacity" : ""}`}>
            {selection.active && (
              <SelectionHeader
                selection={selection}
                selectingAll={selectingAll}
                onSelectAll={() => void selectAllFound()}
              />
            )}
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm text-muted" aria-live="polite">
                {tItems("countFound", { count: total })}
              </p>
              {!selection.active && (
                <button
                  type="button"
                  onClick={() => selection.start()}
                  className="inline-flex min-h-11 items-center gap-1.5 rounded-xl px-2 text-sm font-medium text-accent"
                >
                  <CheckSquare className="size-4" aria-hidden />
                  {tBulk("select")}
                </button>
              )}
            </div>
            <ItemTable items={results} categories={categories} fullPath selection={selection} />
            {moreToLoad && (
              <Button onClick={() => void loadMore()} pending={loadingMore} className="w-full">
                {tItems("showMore")}
              </Button>
            )}
            {selection.active && <BulkBar ids={[...selection.selected]} categories={categories} onDone={selection.exit} />}
          </div>
        ))}
      <UndoToast />
    </div>
  );
}
