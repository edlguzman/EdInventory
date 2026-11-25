"use client";

import { useEffect, useId, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { BookOpen, Check, ChevronRight, CircleCheck, MapPin, Mic, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { createItemsWithoutPhotos } from "@/app/(app)/items/actions";
import { findSimilarItems, type ExistingItem } from "@/app/(app)/items/duplicate-actions";
import { createLocationChain } from "@/app/(app)/locations/actions";
import { useDataLang } from "@/components/data-lang/context";
import { useHelpTopic } from "@/components/help/help-sheet";
import { LocationPicker } from "@/components/locations/location-picker";
import { useCurrentLocation, useLocations } from "@/components/locations/locations-context";
import { useOffline } from "@/components/offline-banner";
import { useAiOff } from "@/components/plan-context";
import { Alert, Button } from "@/components/ui/buttons";
import { Sheet } from "@/components/ui/sheet";
import { StickyActions } from "@/components/ui/sticky-actions";
import { VoiceInput } from "@/components/voice-input";
import { voiceAdd } from "@/lib/ai/client";
import type { PlaceAnswer, VoiceAddResult, VoiceItem } from "@/lib/ai/types";
import { VOICE_ADD_RECORDING_MS, VOICE_ADD_TEXT_MAX } from "@/lib/audio/limits";
import { hasRequiredName } from "@/lib/data-lang";
import type { CategoryOption } from "@/lib/items/data";
import { pickText } from "@/lib/items/types";
import { medicineCategoryId, type MedSubtype } from "@/lib/medicines/attrs";
import { inputFromSuggestion } from "@/lib/medicines/merge";
import { setBackOverride } from "@/lib/nav-history";
import { useErrorText } from "@/lib/use-error-text";
import { DESCRIPTION_MAX, ITEM_NAME_MAX } from "@/lib/validation/items";
import { BooksCategoryCard, useBooksCategory } from "./books";
import { SimilarNote } from "./duplicate-notice";
import { MedicineCategoryCard } from "./medicine";
import { MedicineLine } from "./multi-add";

const fieldClass =
  "w-full min-w-0 rounded-lg border border-border bg-background px-3 py-2 text-base outline-none focus:border-accent aria-invalid:border-red-500";

/** The "By voice" card of the Add screen: a phrase by voice or text, 1 AI request. */
export function VoiceAddCard({ disabled, onResult }: { disabled: boolean; onResult: (r: VoiceAddResult) => void }) {
  const t = useTranslations("voiceAdd");
  const errorText = useErrorText();
  const aiOff = useAiOff();
  const offline = useOffline();
  const here = useCurrentLocation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [unheard, setUnheard] = useState<string | null>(null);

  async function submit(input: { audio?: Blob; text?: string }) {
    setError(undefined);
    setUnheard(null);
    setBusy(true);
    const r = await voiceAdd({ ...input, currentLocationId: here?.id ?? null });
    setBusy(false);
    if ("error" in r) return setError(r.error);
    if (r.items.length === 0) return setUnheard(r.transcript);
    onResult(r);
  }

  return (
    <section aria-labelledby="add-voice" className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-4">
      <div className="flex items-start gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent">
          <Mic className="size-6" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id="add-voice" className="font-semibold">
            {t("title")}
          </h2>
          <p className="text-sm text-muted">{t("hint")}</p>
        </div>
      </div>
      <VoiceInput
        multiline
        label={t("label")}
        placeholder={t("placeholder")}
        maxLength={VOICE_ADD_TEXT_MAX}
        maxMs={VOICE_ADD_RECORDING_MS}
        busy={busy || disabled || aiOff || offline}
        onSubmit={(input) => void submit(input)}
        onError={setError}
      />
      {busy && (
        <p role="status" className="text-sm text-muted">
          {t("working")}
        </p>
      )}
      {error && <Alert>{errorText(error)}</Alert>}
      {unheard !== null && (
        <Alert tone="warning">
          {t("nothing")}
          {unheard && (
            <>
              {" "}
              <q>{unheard}</q>
            </>
          )}
        </Alert>
      )}
    </section>
  );
}

/** Where a card goes: "I'm here", a place of the phrase (by index), or one chosen on the card. */
type CardPlace = { kind: "here" } | { kind: "named"; index: number } | { kind: "id"; id: string };

type Card = {
  key: string;
  ai: VoiceItem;
  selected: boolean;
  /** Ticked or unticked by the user: the duplicate check no longer changes it. */
  touched: boolean;
  name_local: string;
  name_en: string;
  description_local: string;
  description_en: string;
  category_id: string | null;
  place: CardPlace;
};

const same = (a: string | null | undefined, b: string | null | undefined) => {
  const [x, y] = [a, b].map((s) => (s ?? "").trim().toLowerCase().replace(/ё/g, "е"));
  return x !== "" && x === y;
};

/**
 * Review of what was said: cards with ticks, names, description, category and a place of their
 * own. A place named in the phrase or chosen on a card is for that item only ("I'm here" does not
 * change); items without one go to "I'm here". Missing places are created only after "Create".
 */
export function VoiceAdd({
  result,
  categories: initialCategories,
  onCancel,
}: {
  result: VoiceAddResult;
  categories: CategoryOption[];
  onCancel: () => void;
}) {
  const t = useTranslations("voiceAdd");
  const tMulti = useTranslations("multi");
  const tVoice = useTranslations("voice");
  const tItems = useTranslations("items");
  const tBooks = useTranslations("books");
  const tMed = useTranslations("medicine");
  const tDup = useTranslations("duplicates");
  const tCommon = useTranslations("common");
  const errorText = useErrorText();
  const offline = useOffline();
  const { display, mode: dataMode, edit: editLangs, lang: myLang } = useDataLang();
  const { byId, path, childrenOf } = useLocations();
  const here = useCurrentLocation();
  const hereId = here?.id ?? null;
  const id = useId();
  useHelpTopic("voice");

  const books = useBooksCategory(initialCategories);
  const categories = books.categories;
  const [cards, setCards] = useState<Card[]>(() =>
    result.items.map((ai) => ({
      key: crypto.randomUUID(),
      ai,
      selected: true,
      touched: false,
      name_local: ai.name_local,
      name_en: ai.name_en,
      description_local: ai.description_local,
      description_en: ai.description_en,
      category_id: ai.category_id,
      place: ai.place === null ? { kind: "here" } : { kind: "named", index: ai.place },
    })),
  );
  const [similar, setSimilar] = useState<Record<string, ExistingItem>>({});
  const [invalid, setInvalid] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState<{ count: number; skipped: number } | null>(null);
  const [picking, setPicking] = useState<{ card: string } | { place: number } | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [creating, startCreate] = useTransition();
  const [askBooks, setAskBooks] = useState(() => !books.booksId && result.items.some((i) => i.book));
  const missingMedicineCategory = (list: Card[]): MedSubtype | null =>
    (["medicine", "supplement"] as const).find((k) => list.some((c) => c.ai.medicine?.subtype === k) && !medicineCategoryId(categories, k)) ?? null;
  const [askMedicine, setAskMedicine] = useState<MedSubtype | null>(() => missingMedicineCategory(cards));

  // --- Places of the phrase -----------------------------------------------------------------------
  /** Decided by the user: a place, or "I'm here" instead. */
  const [decided, setDecided] = useState<Record<number, string | "here">>({});

  /** What is still missing of a chain: parts created meanwhile (for another item) are found by name. */
  const missing = (create: NonNullable<PlaceAnswer["create"]>) => {
    let parent = create.parent_id;
    let names = create.names;
    while (names.length > 0) {
      const found = childrenOf(parent).find((c) => same(c.nameLocal, names[0].name_local) || same(c.nameEn, names[0].name_en));
      if (!found) break;
      parent = found.id;
      names = names.slice(1);
    }
    return { parent_id: parent, names };
  };
  const resolved = result.places.map((p, i): string | "here" | null => {
    if (decided[i]) return decided[i];
    if (p.match) return p.match;
    if (p.create) {
      const left = missing(p.create);
      if (left.names.length === 0) return left.parent_id;
    }
    return null;
  });
  /** undefined = not decided yet. */
  const locationOf = (c: Card): string | null | undefined => {
    if (c.place.kind === "here") return hereId;
    if (c.place.kind === "id") return c.place.id;
    const r = resolved[c.place.index];
    return r === null ? undefined : r === "here" ? hereId : r;
  };
  const decide = (index: number, value: string | "here") => setDecided((d) => ({ ...d, [index]: value }));
  const open = result.places.map((_, i) => i).filter((i) => resolved[i] === null && cards.some((c) => c.selected && c.place.kind === "named" && c.place.index === i));

  const createPlace = (index: number, create: NonNullable<PlaceAnswer["create"]>) =>
    startCreate(async () => {
      setError(undefined);
      const r = await createLocationChain(missing(create));
      if (!r.ok) return setError(r.error);
      decide(index, r.data.id);
    });

  // --- Similar items already in the inventory (by name, no AI), near each card's place -------------
  const similarKey = done ? "" : cards.map((c) => `${c.key}:${locationOf(c) ?? ""}`).join();
  useEffect(() => {
    if (!similarKey) return;
    let stale = false;
    const groups = new Map<string | null, Card[]>();
    for (const c of cards) {
      const place = locationOf(c) ?? null;
      groups.set(place, [...(groups.get(place) ?? []), c]);
    }
    void (async () => {
      const found: Record<string, ExistingItem> = {};
      for (const [locationId, list] of groups) {
        const matches = await findSimilarItems({ names: list.map((c) => ({ local: c.ai.name_local, en: c.ai.name_en })), locationId }).catch(() => ({}) as Record<number, ExistingItem>);
        list.forEach((c, i) => matches[i] && (found[c.key] = matches[i]));
      }
      if (stale) return;
      setSimilar(found);
      setCards((cur) => cur.map((c) => (c.touched ? c : { ...c, selected: !found[c.key] })));
    })();
    return () => {
      stale = true;
    };
    // Again for a new place of a card only, not on every edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [similarKey]);

  // --- Leaving: what was said is not thrown away without asking -------------------------------------
  const cancel = () => (done ? onCancel() : setConfirmCancel(true));
  const cancelRef = useRef(cancel);
  useEffect(() => {
    cancelRef.current = saving ? () => {} : cancel;
  });
  useEffect(() => {
    setBackOverride(() => cancelRef.current());
    return () => setBackOverride(null);
  }, []);

  const update = (key: string, patch: Partial<Card>) => {
    setCards((list) => list.map((c) => (c.key === key ? { ...c, ...patch } : c)));
    setInvalid((s) => (s.has(key) ? new Set([...s].filter((k) => k !== key)) : s));
  };
  const selected = cards.filter((c) => c.selected);
  const allSelected = selected.length === cards.length;
  const unticked = cards.filter((c) => similar[c.key] && !c.selected).length;
  const label = (c: CategoryOption) => pickText(c.name_local, c.name_en, display);
  const newNames = useMemo(
    () => (names: { name_local: string; name_en: string }[]) => names.map((n) => pickText(n.name_local, n.name_en, display)).join(" → "),
    [display],
  );

  async function save() {
    setError(undefined);
    const bad = new Set(selected.filter((c) => !hasRequiredName(dataMode, c.name_local, c.name_en)).map((c) => c.key));
    setInvalid(bad);
    if (bad.size > 0) {
      document.getElementById(`${id}-${[...bad][0]}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      return setError("multiNameRequired");
    }
    if (open.length > 0) {
      document.getElementById(`${id}-place-${open[0]}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      return setError("voicePlaceOpen");
    }
    setSaving(true);
    // Only my language shown: an edited text makes the AI's English stale (cleared, translated again later).
    const english = (local: string, aiLocal: string, en: string) => (dataMode === "local" && local.trim() !== aiLocal ? "" : en);
    const r = await createItemsWithoutPhotos({
      items: selected.map((c) => ({
        id: crypto.randomUUID(),
        category_id: c.category_id,
        location_id: locationOf(c) ?? null,
        fields: {
          name_local: c.name_local,
          name_en: english(c.name_local, c.ai.name_local, c.name_en),
          description_local: c.description_local,
          description_en: english(c.description_local, c.ai.description_local, c.description_en),
          tags_local: c.ai.tags_local,
          tags_en: c.ai.tags_en,
          ...(c.ai.book && {
            book_author: c.ai.book.author ?? "",
            book_year: c.ai.book.year ? String(c.ai.book.year) : "",
            book_isbn: c.ai.book.isbn ?? "",
          }),
        },
        // Said by the user, not found by the AI: no "from the AI" mark.
        medicine: c.ai.medicine ? { ...inputFromSuggestion(c.ai.medicine), for_whom: c.ai.for_whom, source: "" as const } : null,
      })),
    }).catch(() => ({ ok: false, error: "network" }) as const);
    setSaving(false);
    if (!r.ok) return setError(r.error);
    setDone(r.data);
  }

  if (done) {
    return (
      <div className="flex flex-col items-center gap-4 py-8 text-center">
        <CircleCheck className="size-12 text-accent" aria-hidden />
        <p role="status" className="text-lg font-semibold">
          {tMulti("saved", { count: done.count })}
        </p>
        {done.skipped > 0 && <Alert tone="warning">{tMulti("skippedByPlan", { count: done.skipped })}</Alert>}
        <div className="flex w-full flex-col gap-2">
          <Link href="/" className="flex min-h-12 items-center justify-center rounded-xl bg-accent px-4 font-semibold text-accent-foreground">
            {tMulti("openItems")}
          </Link>
          <Button onClick={onCancel}>{t("again")}</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {result.transcript && (
        <p className="text-sm text-muted">
          {tVoice("heard")} <q className="text-foreground">{result.transcript}</q>
        </p>
      )}
      {error && error !== "voicePlaceOpen" && <Alert>{errorText(error)}</Alert>}

      {askBooks && !books.booksId && (
        <BooksCategoryCard
          many={cards.filter((c) => c.ai.book).length > 1}
          pending={books.pending}
          failed={books.failed}
          onDismiss={() => setAskBooks(false)}
          onCreate={async () => {
            const created = await books.create({ local: tBooks("categoryName"), en: "Books" });
            if (!created) return;
            setCards((list) => list.map((c) => (c.ai.book && !c.category_id ? { ...c, category_id: created } : c)));
            setAskBooks(false);
          }}
        />
      )}
      {askMedicine && !medicineCategoryId(categories, askMedicine) && (
        <MedicineCategoryCard
          subtype={askMedicine}
          pending={books.pending}
          failed={books.failed}
          onDismiss={() => setAskMedicine(null)}
          onCreate={async () => {
            const subtype = askMedicine;
            const created = await books.create(
              subtype === "supplement" ? { local: tMed("categorySupplements"), en: "Vitamins & supplements" } : { local: tMed("categoryMedicines"), en: "Medicines" },
            );
            if (!created) return;
            const next = cards.map((c) => (c.ai.medicine?.subtype === subtype && !c.category_id ? { ...c, category_id: created } : c));
            setCards(next);
            setAskMedicine(missingMedicineCategory(next.filter((c) => c.ai.medicine?.subtype !== subtype)));
          }}
        />
      )}

      {open.map((i) => {
        const p = result.places[i];
        const left = p.create && missing(p.create);
        const parent = left?.parent_id ? byId.get(left.parent_id) : undefined;
        return (
          <div key={i} id={`${id}-place-${i}`} data-place={i} className="flex flex-col gap-2 rounded-2xl border border-accent bg-surface p-3">
            {left ? (
              <p className="text-sm">
                {parent
                  ? tVoice.rich("createInside", { names: newNames(left.names), parent: path(parent), b: (c) => <strong className="font-medium">{c}</strong> })
                  : tVoice.rich("createTop", { names: newNames(left.names), b: (c) => <strong className="font-medium">{c}</strong> })}
              </p>
            ) : (
              <p className="text-sm font-medium">{tVoice("whichPlace")}</p>
            )}
            {error === "voicePlaceOpen" && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{errorText(error)}</p>}
            <p className="text-xs text-muted">
              {t("placeFor", { names: cards.filter((c) => c.selected && c.place.kind === "named" && c.place.index === i).map((c) => pickText(c.name_local, c.name_en, display)).join(", ") })}
            </p>
            {p.ambiguous.map((locId) => {
              const loc = byId.get(locId);
              return loc ? (
                <button key={locId} type="button" onClick={() => decide(i, locId)} className="flex min-h-11 items-center gap-2 rounded-lg px-2 text-left active:bg-background">
                  <MapPin className="size-4 shrink-0 text-muted" aria-hidden />
                  <span className="text-sm">{path(loc)}</span>
                </button>
              ) : null;
            })}
            {left && (
              <Button variant="primary" pending={creating} disabled={offline} onClick={() => createPlace(i, p.create!)}>
                <Plus className="size-4" aria-hidden />
                {tVoice("create")}
              </Button>
            )}
            <div className="flex gap-2">
              <Button className="flex-1 text-sm" onClick={() => setPicking({ place: i })}>
                {t("otherPlace")}
              </Button>
              <Button className="flex-1 text-sm" onClick={() => decide(i, "here")}>
                {here ? t("toHere") : t("noPlace")}
              </Button>
            </div>
          </div>
        );
      })}

      <div className="flex items-center justify-between gap-2">
        <span className="text-sm text-muted">{tMulti("selectedOf", { n: selected.length, total: cards.length })}</span>
        <Button variant="ghost" className="-mr-4" onClick={() => setCards((list) => list.map((c) => ({ ...c, selected: !allSelected, touched: true })))}>
          {allSelected ? tMulti("selectNone") : tMulti("selectAll")}
        </Button>
      </div>
      {unticked > 0 && <p className="-mt-2 text-sm text-amber-800 dark:text-amber-200">{tDup("similarHint", { count: unticked })}</p>}

      <ul className="flex flex-col gap-3">
        {cards.map((c, i) => {
          const bad = invalid.has(c.key);
          const location = locationOf(c);
          const loc = location ? byId.get(location) : undefined;
          return (
            <li key={c.key} id={`${id}-${c.key}`} data-card className={`flex flex-col gap-2 rounded-xl border p-2 ${bad ? "border-red-500" : "border-border"}`}>
              <div className={`flex gap-2 transition-opacity ${c.selected ? "" : "opacity-60"}`}>
                <div className="flex min-w-0 flex-1 flex-col gap-2">
                  {editLangs.map((slot) => {
                    const lang = slot === "local" ? myLang : "en";
                    const tag = editLangs.length === 1 ? "" : ` (${lang.toUpperCase()})`;
                    return (
                      <div key={slot} className="flex flex-col gap-1">
                        <input
                          lang={lang}
                          value={c[`name_${slot}`]}
                          maxLength={ITEM_NAME_MAX}
                          disabled={saving}
                          aria-invalid={bad || undefined}
                          aria-label={tMulti("nameOf", { n: i + 1 }) + tag}
                          placeholder={tag ? lang.toUpperCase() : undefined}
                          onChange={(e) => update(c.key, { [`name_${slot}`]: e.target.value })}
                          className={fieldClass}
                        />
                        <textarea
                          lang={lang}
                          rows={c[`description_${slot}`] ? 2 : 1}
                          value={c[`description_${slot}`]}
                          maxLength={DESCRIPTION_MAX}
                          disabled={saving}
                          aria-label={t("descriptionOf", { n: i + 1 }) + tag}
                          placeholder={tItems("description") + tag}
                          onChange={(e) => update(c.key, { [`description_${slot}`]: e.target.value })}
                          className={`${fieldClass} resize-y text-sm`}
                        />
                      </div>
                    );
                  })}
                  <select
                    value={c.category_id ?? ""}
                    disabled={saving}
                    aria-label={tMulti("categoryOf", { n: i + 1 })}
                    onChange={(e) => update(c.key, { category_id: e.target.value || null })}
                    className={`${fieldClass} appearance-none text-sm`}
                  >
                    <option value="">{tItems("noCategory")}</option>
                    {categories.map((x) => (
                      <option key={x.id} value={x.id}>
                        {label(x)}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => setPicking({ card: c.key })}
                    aria-label={t("placeOf", { n: i + 1 })}
                    className={`${fieldClass} flex min-h-11 items-center gap-2 text-left text-sm`}
                  >
                    <MapPin className="size-4 shrink-0 text-muted" aria-hidden />
                    <span className={`min-w-0 flex-1 truncate ${location === undefined ? "text-amber-700 dark:text-amber-300" : loc ? "" : "text-muted"}`}>
                      {location === undefined ? t("placeOpen") : loc ? (c.place.kind === "here" ? `${tItems("isHere")}: ${path(loc)}` : path(loc)) : location ? "…" : t("noPlace")}
                    </span>
                    <ChevronRight className="size-4 shrink-0 text-muted" aria-hidden />
                  </button>
                </div>
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={c.selected}
                  aria-label={tMulti("saveThis", { n: i + 1 })}
                  disabled={saving}
                  onClick={() => update(c.key, { selected: !c.selected, touched: true })}
                  className="-m-2 flex size-11 shrink-0 items-start justify-end p-2"
                >
                  <span className={`flex size-6 items-center justify-center rounded-md border-2 ${c.selected ? "border-accent bg-accent text-accent-foreground" : "border-border"}`}>
                    {c.selected && <Check className="size-4" strokeWidth={3} aria-hidden />}
                  </span>
                </button>
              </div>
              {c.ai.book && (c.ai.book.author || c.ai.book.year) && (
                <p className="flex items-center gap-1.5 px-1 text-sm text-muted">
                  <BookOpen className="size-4 shrink-0 text-accent" aria-label={tBooks("title")} />
                  <span className="min-w-0 truncate">{[c.ai.book.author, c.ai.book.year].filter(Boolean).join(" · ")}</span>
                </p>
              )}
              {c.ai.medicine && <MedicineLine m={c.ai.medicine} />}
              {c.ai.for_whom && <p className="px-1 text-sm text-muted">{`${tMed("forWhom")}: ${c.ai.for_whom}`}</p>}
              {similar[c.key] && <SimilarNote item={similar[c.key]} />}
            </li>
          );
        })}
      </ul>

      <StickyActions>
        <Button onClick={cancel} disabled={saving} className="flex-1">
          {tCommon("cancel")}
        </Button>
        <Button variant="primary" pending={saving} disabled={offline || selected.length === 0} onClick={() => void save()} className="flex-[2]">
          {saving ? tItems("saving") : selected.length === cards.length && cards.length > 1 ? t("saveAll", { count: cards.length }) : tMulti("saveSelected", { count: selected.length })}
        </Button>
      </StickyActions>

      <Sheet
        open={confirmCancel}
        onClose={() => setConfirmCancel(false)}
        title={tMulti("cancelTitle")}
        footer={
          <div className="flex gap-2">
            <Button onClick={() => setConfirmCancel(false)} className="flex-1">
              {tMulti("keepReviewing")}
            </Button>
            <Button variant="danger" onClick={onCancel} className="flex-1">
              {tMulti("discard")}
            </Button>
          </div>
        }
      >
        <p>{tMulti("cancelText", { count: cards.length })}</p>
      </Sheet>

      <LocationPicker
        open={picking !== null}
        onClose={() => setPicking(null)}
        title={tItems("choosePlace")}
        initialId={picking && "card" in picking ? (locationOf(cards.find((c) => c.key === picking.card)!) ?? null) : null}
        allowRoot
        rootLabel={here ? `${tItems("isHere")}: ${path(here)}` : t("noPlace")}
        onSelect={(next) => {
          if (picking && "card" in picking) update(picking.card, { place: next ? { kind: "id", id: next } : { kind: "here" } });
          else if (picking) decide(picking.place, next ?? "here");
          setPicking(null);
        }}
      />
    </div>
  );
}
