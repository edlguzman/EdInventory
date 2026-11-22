"use client";

import { useDataLang } from "@/components/data-lang/context";
import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, useWatch, type UseFormReturn } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { BookOpen, ChevronRight, LoaderCircle, Sparkles, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useHelpTopic } from "@/components/help/help-sheet";
import { createItem, updateItem } from "@/app/(app)/items/actions";
import { findPhotoUses, type ExistingItem } from "@/app/(app)/items/duplicate-actions";
import { LocationPicker } from "@/components/locations/location-picker";
import { PlaceAssistant } from "@/components/locations/place-assistant";
import { useHerePlace, useLocations } from "@/components/locations/locations-context";
import { DictationField } from "@/components/dictation-field";
import { NameFields } from "@/components/name-fields";
import { Alert, Button } from "@/components/ui/buttons";
import { recognizeItem } from "@/lib/ai/client";
import { findIsbnBarcode } from "@/lib/books/barcode";
import { fetchCoverImage, lookupBook } from "@/lib/books/client";
import { formatIsbn, isBooksCategoryName, normalizeIsbn, type BookInfo, type BookLookup } from "@/lib/books/isbn";
import type { ItemSuggestion, RecognizeResult } from "@/lib/ai/types";
import type { CategoryOption } from "@/lib/items/data";
import type { ItemDetail } from "@/lib/items/types";
import { MAX_PHOTOS, PHOTO_BUCKET, photoFiles, photoPath, thumbPath } from "@/lib/photos/paths";
import { processPhoto } from "@/lib/photos/process";
import { createClient } from "@/lib/supabase/client";
import { editSlots, slotLang, type Slot } from "@/lib/data-lang";
import { useErrorText } from "@/lib/use-error-text";
import { DESCRIPTION_MAX, ITEM_NAME_MAX, itemFieldsSchema, type ItemFieldsInput } from "@/lib/validation/items";
import type { NamePairInput } from "@/lib/validation/names";
import { PhotoPicker, type PhotoDraft } from "./photo-picker";
import { useAiOff, usePlanLimitText } from "@/components/plan-context";
import { useOffline } from "@/components/offline-banner";
import { BookFields, BooksCategoryCard, CoverOffer, useBooksCategory, type CoverChoice, type IsbnOutcome } from "./books";
import { PhotoUsedNotice } from "./duplicate-notice";
import { ItemSuggestionCard } from "./item-suggestion";
import { TagsInput } from "./tags-input";

/**
 * A new item handed over with ready photos (the first is primary) and, optionally, what the AI
 * already recognized. Without a recognition the first photo is recognized right away.
 */
export type ItemSeed = { photos: { main: Blob; thumb: Blob; hash?: string | null }[]; recognition: RecognizeResult | null };

type Props = { userId: string; categories: CategoryOption[] } & (
  | { mode: "create"; item?: undefined; seed?: ItemSeed; onCancel?: () => void }
  | { mode: "edit"; item: ItemDetail; seed?: undefined; onCancel?: undefined }
);

/** Key of the catalogue cover among the form's photos. */
const COVER_KEY = "catalog-cover";

const fieldClass =
  "w-full rounded-xl border border-border bg-surface px-4 py-3 text-base outline-none focus:border-accent aria-invalid:border-red-500";

export function ItemForm({ mode, item, userId, categories: initialCategories, seed, onCancel }: Props) {
  const t = useTranslations("items");
  const tBooks = useTranslations("books");
  const tCommon = useTranslations("common");
  const tDup = useTranslations("duplicates");
  const errorText = useErrorText();
  const { display: locale, mode: dataMode, lang: myLang } = useDataLang();
  // A record in another language is edited through English until translated.
  const foreign = !!item?.foreign;
  const editLangs = editSlots(dataMode, foreign);
  const aiOff = useAiOff();
  const offline = useOffline();
  const router = useRouter();
  const id = useId();
  const { byId, path } = useLocations();

  const [photos, setPhotos] = useState<PhotoDraft[]>(() =>
    seed
      ? seed.photos.map((p, i) => ({
          key: `seed-${i}`,
          kind: "new" as const,
          main: p.main,
          thumb: p.thumb,
          preview: URL.createObjectURL(p.thumb),
          hash: p.hash ?? null,
        }))
      : (item?.photos.map((p) => ({ key: p.id, kind: "existing" as const, path: p.path, preview: p.thumbUrl, url: p.url })) ?? []),
  );
  const [primaryKey, setPrimaryKey] = useState<string | null>(
    () => (seed ? (seed.photos.length ? "seed-0" : null) : (item?.photos.find((p) => p.isPrimary)?.id ?? item?.photos[0]?.id ?? null)),
  );
  const seeded = seed?.recognition ?? null;
  // Categories plus a "Books" category created from this form.
  const books = useBooksCategory(initialCategories);
  const categories = books.categories;
  const [categoryId, setCategoryId] = useState<string | null>(item?.categoryId ?? seeded?.category_id ?? null);
  // New item: the place IS "I'm here" (choosing it here changes it everywhere).
  // Editing an item: the place belongs to that item only.
  const [herePlace, setHerePlace] = useHerePlace();
  const [editLocation, setEditLocation] = useState<string | null>(item?.locationId ?? null);
  const locationId = mode === "edit" ? editLocation : herePlace;
  const setLocationId = mode === "edit" ? setEditLocation : setHerePlace;
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState<string>();
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [recognizing, setRecognizing] = useState(false);
  const [recognized, setRecognized] = useState(!!seeded);
  const [aiError, setAiError] = useState<string>();
  const [suggestion, setSuggestion] = useState<ItemSuggestion | null>(null);
  // Duplicate check (new items): items that already have a photo made from the same file.
  const [photoUses, setPhotoUses] = useState<ExistingItem[] | null>(null);
  const [heldRecognition, setHeldRecognition] = useState<PhotoDraft | null>(null);
  const checkedHashes = useRef(new Set<string>());
  // Books: the author/year/ISBN block, "create the Books category?", a book found by its barcode.
  const [showBook, setShowBook] = useState(!!(item?.bookAuthor || item?.bookYear || item?.bookIsbn || seeded?.book));
  // "?" while the Book block is shown: the Books section.
  useHelpTopic("books", showBook);
  const [askBooksCategory, setAskBooksCategory] = useState(!!seeded?.book && !books.booksId);
  const [scanning, setScanning] = useState(false);
  const [foundIsbn, setFoundIsbn] = useState<string | null>(null);
  // A catalogue cover: its photo draft (key COVER_KEY), where it goes, and its own card preview.
  const [cover, setCover] = useState<{
    isbn: string;
    draft: Extract<PhotoDraft, { kind: "new" }>;
    card: string;
    source: "google" | "openlibrary";
    choice: CoverChoice;
  } | null>(null);
  const [coverBusy, setCoverBusy] = useState(false);
  const [coverNote, setCoverNote] = useState<string>();
  // The latest photos for async cover placement (state in an awaited callback would be stale).
  const latest = useRef({ photos, primaryKey });
  useEffect(() => {
    latest.current = { photos, primaryKey };
  });

  const form = useForm<ItemFieldsInput>({
    resolver: zodResolver(itemFieldsSchema(dataMode, foreign)),
    // Text of a slot that is not shown stays in the form values; the server decides what
    // to write (a slot the user does not see is kept as stored).
    defaultValues: {
      name_local: item?.nameLocal ?? seeded?.name_local ?? "",
      name_en: item?.nameEn ?? seeded?.name_en ?? "",
      description_local: item?.descriptionLocal ?? seeded?.description_local ?? "",
      description_en: item?.descriptionEn ?? seeded?.description_en ?? "",
      tags_local: item?.tagsLocal ?? seeded?.tags_local ?? [],
      tags_en: item?.tagsEn ?? seeded?.tags_en ?? [],
      book_author: item?.bookAuthor ?? seeded?.book?.author ?? "",
      book_year: String(item?.bookYear ?? seeded?.book?.year ?? ""),
      book_isbn: item?.bookIsbn ?? seeded?.book?.isbn ?? "",
    },
  });
  const {
    register,
    control,
    setValue,
    formState: { errors, isSubmitting },
  } = form;
  const tagsLocal = useWatch({ control, name: "tags_local" });
  const tagsEn = useWatch({ control, name: "tags_en" });
  /** Tag lists shown: English only (en), my language (local), both (local_en or a foreign record). */
  const tagSlots: Slot[] = editLangs;

  const place = locationId ? byId.get(locationId) : undefined;

  /** AI prefills only empty fields: what the user typed is never overwritten. */
  function applyRecognition(r: RecognizeResult) {
    const v = form.getValues();
    const fill = (name: "name_local" | "name_en" | "description_local" | "description_en", value: string) => {
      if (value && !v[name].trim()) setValue(name, value, { shouldDirty: true, shouldValidate: name.startsWith("name") });
    };
    fill("name_local", r.name_local);
    fill("name_en", r.name_en);
    fill("description_local", r.description_local);
    fill("description_en", r.description_en);
    if (r.tags_local.length && v.tags_local.length === 0) setValue("tags_local", r.tags_local, { shouldDirty: true });
    if (r.tags_en.length && v.tags_en.length === 0) setValue("tags_en", r.tags_en, { shouldDirty: true });
    if (r.category_id) setCategoryId((current) => current ?? r.category_id);
    if (r.book) applyBook(r.book);
    // ISBN read from the user's own cover photo: the catalogue cover is offered, "not needed" by default.
    if (r.book?.isbn) void searchCover(r.book.isbn, "none");
  }

  /** Book fields: only empty ones are filled; the block opens; the Books category is chosen or offered. */
  function applyBook(b: BookInfo) {
    const v = form.getValues();
    const opts = { shouldDirty: true, shouldValidate: true };
    if (b.author && !v.book_author?.trim()) setValue("book_author", b.author, opts);
    if (b.year && !v.book_year?.trim()) setValue("book_year", String(b.year), opts);
    if (b.isbn && !v.book_isbn?.trim()) setValue("book_isbn", b.isbn, opts);
    setShowBook(true);
    if (books.booksId) setCategoryId((current) => current ?? books.booksId);
    else setAskBooksCategory(true);
  }

  /**
   * A catalogue answer (by ISBN): the title as published goes into the empty name in my
   * language, and into English the English title if the catalogue knows one (else the same
   * printed title); the description into the field of the book's language if that is shown.
   */
  function applyLookup(b: BookLookup) {
    const v = form.getValues();
    const opts = { shouldDirty: true, shouldValidate: true };
    if (b.title) {
      const local = dataMode === "en" ? null : b.title;
      const en = dataMode === "en" ? (b.titleEn ?? b.title) : (b.titleEn ?? b.title);
      if (local && !v.name_local.trim()) setValue("name_local", local.slice(0, ITEM_NAME_MAX), opts);
      if (en && !v.name_en.trim()) setValue("name_en", en.slice(0, ITEM_NAME_MAX), opts);
    }
    const descSlot: Slot | null = b.language === "en" ? "en" : b.language && b.language === myLang ? "local" : null;
    if (b.description && descSlot && editLangs.includes(descSlot)) {
      const field = descSlot === "local" ? "description_local" : "description_en";
      if (!v[field].trim()) setValue(field, b.description.slice(0, DESCRIPTION_MAX), opts);
    }
    applyBook({ author: b.author, year: b.year, isbn: b.isbn });
  }

  /** The cover's place among the photos: first (main), second, or not among them. */
  function placeCover(list: PhotoDraft[], primary: string | null, draft: PhotoDraft, choice: CoverChoice) {
    const others = list.filter((p) => p.key !== COVER_KEY);
    const fallback = primary && primary !== COVER_KEY ? primary : (others[0]?.key ?? null);
    if (choice === "none" || others.length >= MAX_PHOTOS) return { photos: others, primary: fallback };
    if (choice === "main") return { photos: [draft, ...others], primary: COVER_KEY };
    const next = [...others];
    next.splice(Math.min(1, next.length), 0, draft);
    return { photos: next, primary: fallback ?? COVER_KEY };
  }

  function chooseCover(choice: CoverChoice) {
    if (!cover) return;
    const r = placeCover(photos, primaryKey, cover.draft, choice);
    setCover({ ...cover, choice });
    setPhotos(r.photos);
    setPrimaryKey(r.primary);
  }

  /**
   * The default for a found cover: the main photo when there is no own photo yet (or only the
   * barcode shot); otherwise "not needed" — the user's own photo of the cover stays the main one.
   */
  function defaultCoverChoice(): CoverChoice {
    return latest.current.photos.filter((p) => p.key !== COVER_KEY).length === 0 ? "main" : "none";
  }

  /** Looks a cover up for this ISBN (catalogues, no AI) and offers it with `choice` preselected. */
  async function searchCover(isbn: string, choice: CoverChoice) {
    if (cover?.isbn === isbn) return; // already offered
    setCoverBusy(true);
    setCoverNote(undefined);
    try {
      const r = await fetchCoverImage(isbn);
      if ("notFound" in r) return setCoverNote(tBooks("coverNotFound"));
      if ("error" in r) return setCoverNote(r.error === "rateLimited" ? tBooks("lookupRateLimited") : errorText(r.error));
      // Compressed on the phone exactly like a photo (1600px JPEG, 480px thumbnail, no metadata).
      const { main, thumb } = await processPhoto(new File([r.blob], "cover", { type: r.blob.type }));
      const draft = { key: COVER_KEY, kind: "new" as const, main, thumb, preview: URL.createObjectURL(thumb), hash: null };
      setCover((old) => {
        if (old) URL.revokeObjectURL(old.card);
        return { isbn, draft, card: URL.createObjectURL(thumb), source: r.source, choice };
      });
      const placed = placeCover(latest.current.photos, latest.current.primaryKey, draft, choice);
      setPhotos(placed.photos);
      setPrimaryKey(placed.primary);
    } catch {
      setCoverNote(errorText("unknown"));
    } finally {
      setCoverBusy(false);
    }
  }

  /** An ISBN typed, scanned or read: catalogues fill the empty fields, then a cover is offered. */
  async function takeIsbn(isbn: string): Promise<IsbnOutcome> {
    setValue("book_isbn", isbn, { shouldDirty: true, shouldValidate: true });
    const r = await lookupBook(isbn);
    if ("error" in r) return r.error;
    if (r.book) applyLookup(r.book);
    else applyBook({ author: null, year: null, isbn });
    void searchCover(isbn, defaultCoverChoice());
    return r.book ? "found" : "notFound";
  }

  /**
   * An ISBN barcode on the photo (read on the phone, no AI): look the book up in the catalogues.
   * Found -> the form is filled and true is returned (no AI request). Not found -> only the
   * ISBN is kept, and the photo is recognized as usual.
   */
  async function fillFromBarcode(photo: PhotoDraft): Promise<boolean> {
    if (photo.kind !== "new") return false;
    setScanning(true);
    try {
      const isbn = await findIsbnBarcode(photo.main);
      if (!isbn) return false;
      const r = await lookupBook(isbn);
      // The photo was a barcode shot: a catalogue cover is offered as the main photo.
      void searchCover(isbn, "main");
      if ("error" in r || !r.book) {
        applyBook({ author: null, year: null, isbn });
        return false;
      }
      applyLookup(r.book);
      setFoundIsbn(isbn);
      return true;
    } finally {
      setScanning(false);
    }
  }

  /** First photo of a new item: a book barcode first (free), else the AI recognition. */
  async function scanThenRecognize(photo: PhotoDraft) {
    if (await fillFromBarcode(photo)) return;
    void recognize(photo);
  }

  async function recognize(photo: PhotoDraft | undefined) {
    if (!photo || aiOff) return; // plan limit reached: no AI (the server refuses it as well)
    setAiError(undefined);
    setRecognizing(true);
    try {
      // New photo: the processed JPEG; stored photo: download it through its signed URL.
      const image = photo.kind === "new" ? photo.main : photo.url ? await (await fetch(photo.url)).blob() : null;
      if (!image) return setAiError("aiFailed");
      const r = await recognizeItem(new Blob([image], { type: "image/jpeg" }), locale);
      if ("error" in r) return setAiError(r.error);
      applyRecognition(r);
      setRecognized(true);
    } catch {
      setAiError("network");
    } finally {
      setRecognizing(false);
    }
  }

  /**
   * New item only: were any of these photos (by the hash of their source file) added before?
   * Shows the warning and returns true if so. Each hash is checked once; no AI involved.
   */
  async function photosAlreadyUsed(list: PhotoDraft[]) {
    if (mode !== "create") return false;
    const hashes = list.flatMap((p) => (p.kind === "new" && p.hash && !checkedHashes.current.has(p.hash) ? [p.hash] : []));
    if (hashes.length === 0) return false;
    hashes.forEach((h) => checkedHashes.current.add(h));
    const uses = Object.values(await findPhotoUses(hashes).catch(() => ({}))).flat();
    if (uses.length === 0) return false;
    setPhotoUses((current) => [...(current ?? []), ...uses.filter((u) => !current?.some((c) => c.id === u.id))]);
    return true;
  }

  /** First photo of a new item: check for a repeat first, so a known photo costs no AI request. */
  async function checkThenRecognize(photo: PhotoDraft, list: PhotoDraft[]) {
    if (await photosAlreadyUsed(list)) return setHeldRecognition(photo);
    void scanThenRecognize(photo);
  }

  // Photos handed over without a recognition: recognize the first one once (1 AI request),
  // as when the first photo is added in the form. The ref keeps it to one request.
  const autoRecognized = useRef(false);
  useEffect(() => {
    if (autoRecognized.current || !seed || photos.length === 0) return;
    autoRecognized.current = true;
    // After this render (state updates belong in the async callback, not the effect body).
    void Promise.resolve().then(async () => {
      if (seed.recognition) await photosAlreadyUsed(photos);
      else await checkThenRecognize(photos[0], photos);
    });
    // Runs once on mount for the seeded photos.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function acceptSuggestion(s: ItemSuggestion) {
    const opts = { shouldDirty: true, shouldValidate: true };
    if (s.name_local) setValue("name_local", s.name_local, opts);
    if (s.name_en) setValue("name_en", s.name_en, opts);
    if (s.description_local) setValue("description_local", s.description_local, opts);
    if (s.description_en) setValue("description_en", s.description_en, opts);
    const addTags = (field: "tags_local" | "tags_en", added: string[]) => {
      if (!added.length) return;
      const current = form.getValues(field);
      const lower = new Set(current.map((x) => x.toLowerCase()));
      setValue(field, [...current, ...added.filter((x) => !lower.has(x.toLowerCase()))].slice(0, 50), opts);
    };
    addTags("tags_local", s.tags_add_local);
    addTags("tags_en", s.tags_add_en);
    setSuggestion(null);
  }
  const label = (c: CategoryOption) => (locale === "en" ? c.name_en || c.name_local : c.name_local || c.name_en);

  const submit = form.handleSubmit(async (fields) => {
    setError(undefined);
    const itemId = mode === "edit" ? item.id : crypto.randomUUID();
    const supabase = createClient();
    const storage = supabase.storage.from(PHOTO_BUCKET);

    // 1. Upload new photos (main + thumbnail) straight to Storage; RLS allows only the user's folder.
    const fresh = photos.filter((p) => p.kind === "new");
    const pathByKey = new Map(photos.flatMap((p) => (p.kind === "existing" ? [[p.key, p.path] as const] : [])));
    const uploaded: string[] = [];
    const hashes: Record<string, string> = {};
    setProgress(fresh.length ? { done: 0, total: fresh.length } : null);
    for (const p of fresh) {
      const main = photoPath(userId, itemId, crypto.randomUUID());
      const opts = { contentType: "image/jpeg", upsert: false };
      const [a, b] = await Promise.all([storage.upload(main, p.main, opts), storage.upload(thumbPath(main), p.thumb, opts)]);
      if (a.error || b.error) {
        await storage.remove([...uploaded, main].flatMap(photoFiles));
        setProgress(null);
        return setError("photoUpload");
      }
      uploaded.push(main);
      pathByKey.set(p.key, main);
      if (p.kind === "new" && p.hash) hashes[main] = p.hash;
      setProgress({ done: uploaded.length, total: fresh.length });
    }
    setProgress(null);

    // 2. Save the item; the server action removes the uploaded files itself if saving fails.
    const ordered = photos.map((p) => pathByKey.get(p.key)!);
    const primary = primaryKey ? (pathByKey.get(primaryKey) ?? null) : null;
    const common = { fields, category_id: categoryId, location_id: locationId };
    const result =
      mode === "create"
        ? await createItem({ ...common, id: itemId, photos: ordered, primary, hashes })
        : await updateItem({
            ...common,
            id: itemId,
            keep: photos.flatMap((p) => (p.kind === "existing" ? [p.path] : [])),
            add: uploaded,
            primary,
            hashes,
          });
    if (!result.ok) return setError(result.error);

    router.replace(`/items/${itemId}`);
  });

  const busy = isSubmitting || progress !== null;
  const limitText = usePlanLimitText();
  const fieldError = (key?: string) => (key ? errorText(key) : undefined);

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-6">
      <PhotoPicker
        photos={photos}
        primaryKey={primaryKey}
        onError={setError}
        onChange={(next, primary) => {
          // First photo of an item with no name yet: recognize it automatically (1 AI request).
          const v = form.getValues();
          const firstPhoto = photos.length === 0 && next.length > 0;
          if (firstPhoto && !v.name_local.trim() && !v.name_en.trim() && !recognized) {
            void checkThenRecognize(next.find((p) => p.key === primary) ?? next[0], next);
          } else {
            void photosAlreadyUsed(next);
          }
          setPhotos(next);
          setPrimaryKey(primary);
          if (cover && cover.choice !== "none" && !next.some((p) => p.key === COVER_KEY)) setCover({ ...cover, choice: "none" });
        }}
      />

      {(recognizing || scanning || photos.length > 0) && (
        <div className="-mt-2 flex flex-col gap-2">
          {recognizing || scanning ? (
            <p role="status" className="flex min-h-11 items-center gap-2 text-sm text-muted">
              <LoaderCircle className="size-4 animate-spin" aria-hidden />
              {scanning ? tBooks("scanning") : t("recognizing")}
            </p>
          ) : (
            <div className="flex flex-wrap items-center gap-x-3">
              {recognized && <span className="text-sm text-muted">{t("recognized")}</span>}
              <Button
                variant="ghost"
                className="-ml-4 text-sm"
                onClick={() => void recognize(photos.find((p) => p.key === primaryKey) ?? photos[0])}
                disabled={aiOff}
                title={limitText}
              >
                <Sparkles className="size-4" aria-hidden />
                {recognized ? t("recognizeAgain") : t("recognize")}
              </Button>
            </div>
          )}
          {foundIsbn && !recognizing && (
            <p role="status" className="flex items-start gap-2 text-sm text-muted">
              <BookOpen className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />
              {tBooks("foundByBarcode", { isbn: formatIsbn(foundIsbn) })}
            </p>
          )}
          {aiError && <Alert>{errorText(aiError)}</Alert>}
        </div>
      )}

      {cover && (
        <CoverOffer
          preview={cover.card}
          source={cover.source}
          choice={cover.choice}
          noRoom={photos.filter((p) => p.key !== COVER_KEY).length >= MAX_PHOTOS}
          onChoose={chooseCover}
        />
      )}
      {coverBusy && !cover && (
        <p role="status" className="-mt-3 flex items-center gap-2 text-sm text-muted">
          <LoaderCircle className="size-4 animate-spin" aria-hidden />
          {tBooks("coverSearching")}
        </p>
      )}
      {coverNote && !cover && <p className="-mt-3 text-sm text-muted">{coverNote}</p>}

      {photoUses && photoUses.length > 0 && (
        <PhotoUsedNotice
          items={photoUses}
          actions={
            <Button
              onClick={() => {
                setPhotoUses(null);
                if (heldRecognition) void scanThenRecognize(heldRecognition);
                setHeldRecognition(null);
              }}
            >
              {heldRecognition ? tDup("recognizeAnyway") : tDup("continueAnyway")}
            </Button>
          }
        />
      )}

      {error && <Alert>{errorText(error)}</Alert>}

      <NameFields form={form as unknown as UseFormReturn<NamePairInput>} max={ITEM_NAME_MAX} foreign={foreign} />

      {editLangs.map((slot) => {
        const lang = slotLang(slot, myLang);
        const name = slot === "local" ? "description_local" : "description_en";
        const otherName = slot === "local" ? "description_en" : "description_local";
        const err = fieldError(errors[name]?.message);
        const set = (field: typeof name | typeof otherName) => (value: string) =>
          setValue(field, value, { shouldValidate: true, shouldDirty: true });
        return (
          <DictationField
            key={slot}
            label={
              editLangs.length === 1 ? t("description") : slot === "local" ? t("descriptionLocal", { lang: lang.toUpperCase() }) : t("descriptionEn")
            }
            htmlFor={`${id}-${name}`}
            slot={slot}
            kind="description"
            max={DESCRIPTION_MAX}
            getValue={() => form.getValues(name)}
            setValue={set(name)}
            other={
              editLangs.length === 2
                ? { slot: slot === "local" ? "en" : "local", get: () => form.getValues(otherName), set: set(otherName) }
                : undefined
            }
          >
            <textarea
              id={`${id}-${name}`}
              lang={lang}
              rows={3}
              maxLength={DESCRIPTION_MAX}
              aria-invalid={err ? true : undefined}
              className={`${fieldClass} resize-y`}
              {...register(name)}
            />
            {err && <p className="text-sm text-red-600 dark:text-red-400">{err}</p>}
          </DictationField>
        );
      })}

      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-category`} className="text-sm font-medium">
          {t("category")}
        </label>
        <select
          id={`${id}-category`}
          value={categoryId ?? ""}
          onChange={(e) => {
            const next = e.target.value || null;
            setCategoryId(next);
            const c = categories.find((x) => x.id === next);
            if (c && (isBooksCategoryName(c.name_local) || isBooksCategoryName(c.name_en))) setShowBook(true);
          }}
          className={`${fieldClass} min-h-12 appearance-none`}
        >
          <option value="">{t("noCategory")}</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {label(c)}
            </option>
          ))}
        </select>
      </div>

      {askBooksCategory && !books.booksId && (
        <BooksCategoryCard
          pending={books.pending}
          failed={books.failed}
          onDismiss={() => setAskBooksCategory(false)}
          onCreate={async () => {
            const created = await books.create({ local: tBooks("categoryName"), en: "Books" });
            if (created) {
              setCategoryId(created);
              setAskBooksCategory(false);
            }
          }}
        />
      )}

      {showBook ? (
        <BookFields
          form={form}
          onIsbn={takeIsbn}
          onFindCover={() => {
            const isbn = normalizeIsbn(form.getValues("book_isbn") ?? "");
            if (isbn) void searchCover(isbn, defaultCoverChoice());
          }}
          coverBusy={coverBusy}
          disabled={offline}
          aiOff={aiOff}
        />
      ) : (
        <Button variant="ghost" className="-mt-3 -ml-4 self-start text-sm" onClick={() => setShowBook(true)}>
          <BookOpen className="size-4" aria-hidden />
          {tBooks("addBookData")}
        </Button>
      )}

      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">{t("place")}</span>
        {mode === "create" && <span className="-mt-1 text-sm text-muted">{t("placeIsHere")}</span>}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setPicking(true)}
            className="flex min-h-12 min-w-0 flex-1 items-center gap-2 rounded-xl border border-border bg-surface px-4 text-left"
          >
            <span className={`min-w-0 flex-1 truncate ${place ? "" : "text-muted"}`}>
              {place ? path(place) : t("noPlaceSelected")}
            </span>
            <ChevronRight className="size-5 shrink-0 text-muted" aria-hidden />
          </button>
          {place && (
            <button
              type="button"
              onClick={() => setLocationId(null)}
              aria-label={t("clearPlace")}
              className="flex size-12 shrink-0 items-center justify-center rounded-xl text-muted"
            >
              <X className="size-5" aria-hidden />
            </button>
          )}
        </div>
      </div>

      <div className="-mt-3 flex flex-col gap-2">
        <span className="text-sm text-muted">{t("placeVoiceHint")}</span>
        <PlaceAssistant
          mode="form"
          getItemContext={() => {
            const v = form.getValues();
            return {
              name_local: v.name_local,
              name_en: v.name_en,
              description_local: v.description_local,
              description_en: v.description_en,
              tags_local: v.tags_local,
              tags_en: v.tags_en,
            };
          }}
          onPlace={(next) => setLocationId(next)}
          onItemSuggestion={setSuggestion}
        />
        {suggestion && (
          <ItemSuggestionCard
            suggestion={suggestion}
            onAccept={() => acceptSuggestion(suggestion)}
            onDecline={() => setSuggestion(null)}
          />
        )}
      </div>

      {tagSlots.map((slot) => {
        const field = slot === "local" ? "tags_local" : "tags_en";
        return (
          <TagsInput
            key={slot}
            lang={slotLang(slot, myLang)}
            label={tagSlots.length === 1 ? undefined : slot === "local" ? t("tagsLocal", { lang: myLang.toUpperCase() }) : t("tagsEn")}
            value={slot === "local" ? tagsLocal : tagsEn}
            onChange={(next) => setValue(field, next, { shouldValidate: true, shouldDirty: true })}
          />
        );
      })}
      {(errors.tags_local || errors.tags_en) && (
        <p className="-mt-4 text-sm text-red-600 dark:text-red-400">
          {fieldError(
            errors.tags_local?.message ?? errors.tags_local?.[0]?.message ?? errors.tags_en?.message ?? errors.tags_en?.[0]?.message,
          )}
        </p>
      )}

      <div className="flex gap-2">
        <Button onClick={() => (onCancel ? onCancel() : router.back())} disabled={busy} className="flex-1">
          {tCommon("cancel")}
        </Button>
        <Button
          variant="primary"
          type="submit"
          pending={busy}
          disabled={offline || (mode === "create" && aiOff)}
          title={mode === "create" ? limitText : undefined}
          className="flex-[2]"
        >
          {progress
            ? t("uploading", { done: Math.min(progress.done + 1, progress.total), total: progress.total })
            : busy
              ? t("saving")
              : t("save")}
        </Button>
      </div>

      <LocationPicker
        open={picking}
        onClose={() => setPicking(false)}
        title={t("choosePlace")}
        initialId={locationId}
        onSelect={(next) => {
          setLocationId(next);
          setPicking(false);
        }}
      />
    </form>
  );
}
