"use client";

import { useId, useRef, useState } from "react";
import { AlertTriangle, LoaderCircle, Pill, Plus, ScanBarcode, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/buttons";
import { pickText, slotLang, type Slot } from "@/lib/data-lang";
import type { Lang } from "@/lib/languages";
import {
  MED_ACTIVE_MAX,
  MED_AMOUNT_MAX,
  MED_COMPONENT_NAME_MAX,
  MED_COMPONENTS_MAX,
  MED_FOR_WHOM_MAX,
  MED_FORM_MAX,
  MED_STRENGTH_MAX,
  MED_USES_MAX,
  MED_WARNINGS_MAX,
  type MedicineAttrs,
  type MedicineInput,
  type MedSource,
  type MedSubtype,
} from "@/lib/medicines/attrs";
import { expiryStatus, formatExpiry, parseExpiry, type ExpiryStatus } from "@/lib/medicines/expiry";

const fieldClass =
  "w-full rounded-xl border border-border bg-surface px-4 py-3 text-base outline-none focus:border-accent aria-invalid:border-red-500";

/** "Reference information, not medical advice…" (supplements: also "not evaluated by the FDA"). */
export function MedicineDisclaimer({ subtype }: { subtype: MedSubtype }) {
  const t = useTranslations("medicine");
  return (
    <p className="flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950 dark:text-amber-200">
      <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
      {subtype === "supplement" ? t("disclaimerSupplement") : t("disclaimerMedicine")}
    </p>
  );
}

/** "per FDA label" / "per AI". */
export function SourceNote({ source }: { source: MedSource | null | "" }) {
  const t = useTranslations("medicine");
  if (!source) return null;
  return <span className="text-xs text-muted">{source === "fda" ? t("sourceFda") : t("sourceAi")}</span>;
}

/** Red "Expired" / amber "Expires 05/2027" chip (nothing when it is far off, unless `always`). */
export function ExpiryBadge({ date, precision, always = false }: { date: string; precision: "month" | "day"; always?: boolean }) {
  const t = useTranslations("medicine");
  const status: ExpiryStatus = expiryStatus(date);
  if (status === "ok" && !always) return null;
  const text = formatExpiry({ date, precision });
  const cls =
    status === "expired"
      ? "bg-red-600 text-white"
      : status === "soon"
        ? "bg-amber-400 text-amber-950"
        : "bg-surface text-muted border border-border";
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>
      {status === "expired" ? t("expiredOn", { date: text }) : t("expiresOn", { date: text })}
    </span>
  );
}

/** "Create the Medicines / Vitamins & supplements category?" */
export function MedicineCategoryCard({
  subtype,
  pending,
  failed,
  onCreate,
  onDismiss,
}: {
  subtype: MedSubtype;
  pending: boolean;
  failed: boolean;
  onCreate: () => void;
  onDismiss: () => void;
}) {
  const t = useTranslations("medicine");
  const tBooks = useTranslations("books");
  const name = subtype === "supplement" ? t("categorySupplements") : t("categoryMedicines");
  return (
    <div role="status" className="flex flex-col gap-2 rounded-2xl border border-accent bg-surface p-3">
      <p className="flex items-start gap-2 text-sm">
        <Pill className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />
        {t("createCategoryQuestion", { name })}
      </p>
      {failed && <p className="text-sm text-red-600 dark:text-red-400">{tBooks("createCategoryFailed")}</p>}
      <div className="flex gap-2">
        <Button onClick={onDismiss} disabled={pending} className="flex-1">
          {tBooks("notNow")}
        </Button>
        <Button variant="primary" onClick={onCreate} pending={pending} className="flex-1">
          {tBooks("createCategory")}
        </Button>
      </div>
    </div>
  );
}

type TextKey = "active" | "form" | "uses" | "warnings";

/**
 * The medicine / supplement block of the item form. Text pairs show the language slots of the
 * data mode (`slots`); strength, amounts, "for whom", expiry and NDC are one value each.
 * "Scan barcode": a photo of the package's barcode, read on the phone (NDC -> FDA data).
 */
export function MedicineFields({
  value,
  onChange,
  slots,
  myLang,
  onRemove,
  onScan,
  scanning,
  note,
  disabled,
}: {
  value: MedicineInput;
  onChange: (next: MedicineInput) => void;
  slots: Slot[];
  myLang: Lang;
  onRemove: () => void;
  onScan: (file: File) => void;
  scanning: boolean;
  note?: string;
  disabled?: boolean;
}) {
  const t = useTranslations("medicine");
  const id = useId();
  const scanRef = useRef<HTMLInputElement>(null);
  const [expiryTouched, setExpiryTouched] = useState(false);
  const set = (patch: Partial<MedicineInput>) => onChange({ ...value, ...patch });
  const isSupplement = value.subtype === "supplement";
  const two = slots.length === 2;
  const label = (base: string, slot: Slot) => (two ? `${base} · ${slotLang(slot, myLang).toUpperCase()}` : base);

  const pair = (key: TextKey, base: string, max: number, area = false) =>
    slots.map((slot) => {
      const field = `${key}_${slot}` as const;
      const fid = `${id}-${field}`;
      return (
        <div key={field} className="flex flex-col gap-1.5">
          <label htmlFor={fid} className="text-sm font-medium">
            {label(base, slot)}
          </label>
          {area ? (
            <textarea
              id={fid}
              lang={slotLang(slot, myLang)}
              rows={2}
              maxLength={max}
              value={value[field]}
              onChange={(e) => set({ [field]: e.target.value } as Partial<MedicineInput>)}
              className={`${fieldClass} resize-y`}
            />
          ) : (
            <input
              id={fid}
              lang={slotLang(slot, myLang)}
              maxLength={max}
              autoComplete="off"
              value={value[field]}
              onChange={(e) => set({ [field]: e.target.value } as Partial<MedicineInput>)}
              className={fieldClass}
            />
          )}
        </div>
      );
    });

  const expiry = parseExpiry(value.expires);
  const expiryInvalid = expiryTouched && value.expires.trim() !== "" && !expiry;

  return (
    <fieldset className="flex flex-col gap-3 rounded-2xl border border-border p-3">
      <legend className="flex items-center gap-1.5 px-1 text-sm font-medium">
        <Pill className="size-4 text-accent" aria-hidden />
        {isSupplement ? t("titleSupplement") : t("titleMedicine")}
      </legend>

      <div className="flex items-center justify-between gap-2">
        <div role="radiogroup" aria-label={t("subtype")} className="flex rounded-xl border border-border p-0.5">
          {(["medicine", "supplement"] as const).map((s) => (
            <button
              key={s}
              type="button"
              role="radio"
              aria-checked={value.subtype === s}
              onClick={() => set({ subtype: s })}
              className={`min-h-10 rounded-lg px-3 text-sm font-medium ${value.subtype === s ? "bg-accent text-accent-foreground" : "text-muted"}`}
            >
              {s === "medicine" ? t("subtypeMedicine") : t("subtypeSupplement")}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={onRemove}
          className="inline-flex min-h-11 items-center gap-1 rounded-xl px-2 text-sm text-muted"
          aria-label={t("notMedicine")}
          title={t("notMedicine")}
        >
          <X className="size-4" aria-hidden />
        </button>
      </div>

      {isSupplement ? (
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium">{t("components")}</span>
          {value.components.length === 0 && <p className="text-sm text-muted">{t("componentsEmpty")}</p>}
          {value.components.map((c, i) => (
            <div key={i} className="flex items-start gap-1">
              <div className="grid min-w-0 flex-1 grid-cols-[1fr_6.5rem] gap-1">
                <div className="flex min-w-0 flex-col gap-1">
                  {slots.map((slot) => {
                    const field = slot === "local" ? "name_local" : "name_en";
                    return (
                      <input
                        key={slot}
                        lang={slotLang(slot, myLang)}
                        aria-label={label(t("componentName"), slot)}
                        placeholder={two ? slotLang(slot, myLang).toUpperCase() : t("componentName")}
                        maxLength={MED_COMPONENT_NAME_MAX}
                        autoComplete="off"
                        value={c[field]}
                        onChange={(e) =>
                          set({ components: value.components.map((x, j) => (j === i ? { ...x, [field]: e.target.value } : x)) })
                        }
                        className={`${fieldClass} min-w-0 px-3 py-2`}
                      />
                    );
                  })}
                </div>
                <input
                  aria-label={t("componentAmount")}
                  placeholder={t("componentAmount")}
                  maxLength={MED_AMOUNT_MAX}
                  autoComplete="off"
                  value={c.amount}
                  onChange={(e) => set({ components: value.components.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)) })}
                  className={`${fieldClass} min-w-0 px-3 py-2`}
                />
              </div>
              <button
                type="button"
                onClick={() => set({ components: value.components.filter((_, j) => j !== i) })}
                aria-label={t("removeComponent")}
                className="flex size-11 shrink-0 items-center justify-center rounded-xl text-muted"
              >
                <X className="size-4" aria-hidden />
              </button>
            </div>
          ))}
          {value.components.length < MED_COMPONENTS_MAX && (
            <Button
              variant="ghost"
              className="-ml-4 self-start text-sm"
              onClick={() => set({ components: [...value.components, { name_local: "", name_en: "", amount: "" }] })}
            >
              <Plus className="size-4" aria-hidden />
              {t("addComponent")}
            </Button>
          )}
        </div>
      ) : (
        <>
          {pair("active", t("active"), MED_ACTIVE_MAX)}
          <div className="grid grid-cols-2 gap-2">
            <div className="flex min-w-0 flex-col gap-1.5">
              <label htmlFor={`${id}-strength`} className="text-sm font-medium">
                {t("strength")}
              </label>
              <input
                id={`${id}-strength`}
                maxLength={MED_STRENGTH_MAX}
                autoComplete="off"
                value={value.strength}
                onChange={(e) => set({ strength: e.target.value })}
                className={`${fieldClass} min-w-0`}
              />
            </div>
            <div className="flex min-w-0 flex-col gap-1.5">
              <label htmlFor={`${id}-rx`} className="text-sm font-medium">
                {t("rx")}
              </label>
              <select
                id={`${id}-rx`}
                value={value.rx}
                onChange={(e) => set({ rx: e.target.value as MedicineInput["rx"] })}
                className={`${fieldClass} min-h-12 min-w-0 appearance-none`}
              >
                <option value="">{t("rxUnknown")}</option>
                <option value="otc">{t("rxOtc")}</option>
                <option value="rx">{t("rxRx")}</option>
              </select>
            </div>
          </div>
        </>
      )}

      {pair("form", t("form"), MED_FORM_MAX)}

      <div className="grid grid-cols-[1fr_auto] items-end gap-2">
        <div className="flex min-w-0 flex-col gap-1.5">
          <label htmlFor={`${id}-expires`} className="text-sm font-medium">
            {t("expires")}
          </label>
          <input
            id={`${id}-expires`}
            inputMode="numeric"
            placeholder={t("expiresPlaceholder")}
            maxLength={20}
            autoComplete="off"
            aria-invalid={expiryInvalid ? true : undefined}
            value={value.expires}
            onChange={(e) => set({ expires: e.target.value })}
            onBlur={() => {
              setExpiryTouched(true);
              // "5/27" -> "05/2027": the way it is stored and shown.
              if (expiry) set({ expires: formatExpiry(expiry) });
            }}
            className={`${fieldClass} min-w-0`}
          />
        </div>
        <div className="flex min-h-12 items-center">{expiry && <ExpiryBadge date={expiry.date} precision={expiry.precision} always />}</div>
      </div>
      {expiryInvalid ? (
        <p className="-mt-2 text-sm text-red-600 dark:text-red-400">{t("expiresInvalid")}</p>
      ) : (
        <p className="-mt-2 text-xs text-muted">{t("expiresHint")}</p>
      )}

      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-for`} className="text-sm font-medium">
          {t("forWhom")}
        </label>
        <input
          id={`${id}-for`}
          maxLength={MED_FOR_WHOM_MAX}
          autoComplete="off"
          placeholder={t("forWhomPlaceholder")}
          value={value.for_whom}
          onChange={(e) => set({ for_whom: e.target.value })}
          className={fieldClass}
        />
      </div>

      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium">{t("aboutTitle")}</span>
        <SourceNote source={value.source} />
      </div>
      {pair("uses", t("uses"), MED_USES_MAX, true)}
      {pair("warnings", t("warnings"), MED_WARNINGS_MAX, true)}

      {!isSupplement && (
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-ndc`} className="text-sm font-medium">
            NDC
          </label>
          <input
            id={`${id}-ndc`}
            inputMode="numeric"
            maxLength={20}
            autoComplete="off"
            value={value.ndc}
            onChange={(e) => set({ ndc: e.target.value })}
            className={fieldClass}
          />
        </div>
      )}
      <div className="-my-1 flex flex-wrap items-center gap-x-2">
        <button
          type="button"
          className="-ml-2 inline-flex min-h-11 items-center gap-1.5 rounded-xl px-2 text-sm font-medium text-accent disabled:opacity-40"
          disabled={scanning || disabled}
          onClick={() => scanRef.current?.click()}
        >
          {scanning ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <ScanBarcode className="size-4" aria-hidden />}
          {scanning ? t("scanning") : t("scanBarcode")}
        </button>
        <input
          ref={scanRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) onScan(file);
          }}
        />
      </div>
      {note && (
        <p role="status" className="-mt-2 text-sm text-muted">
          {note}
        </p>
      )}

      <MedicineDisclaimer subtype={value.subtype} />
    </fieldset>
  );
}

/**
 * The medicine / supplement section of an item card: subtype, active ingredient or composition,
 * strength, form, prescription, expiry, for whom, uses and warnings (with their source), and the
 * reference-only note. Texts in the display slot (the other one if empty).
 */
export function MedicineView({
  m,
  expiresOn,
  slot,
}: {
  m: MedicineAttrs;
  expiresOn: string | null;
  slot: Slot;
}) {
  const t = useTranslations("medicine");
  const text = (key: "active" | "form" | "uses" | "warnings") => pickText(m[`${key}_local`], m[`${key}_en`], slot);
  const active = text("active");
  const form = text("form");
  const uses = text("uses");
  const warnings = text("warnings");
  const row = (label: string, value: React.ReactNode) => (
    <div>
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="break-words">{value}</dd>
    </div>
  );
  return (
    <section aria-label={m.subtype === "supplement" ? t("titleSupplement") : t("titleMedicine")} className="flex flex-col gap-3 rounded-2xl border border-border p-3">
      <p className="flex items-center gap-1.5 text-sm font-medium">
        <Pill className="size-4 text-accent" aria-hidden />
        {m.subtype === "supplement" ? t("subtypeSupplement") : t("subtypeMedicine")}
        {m.rx && <span className="text-muted">· {m.rx === "rx" ? t("rxRx") : t("rxOtc")}</span>}
      </p>
      <dl className="flex flex-col gap-3">
        {expiresOn && row(t("expires"), <ExpiryBadge date={expiresOn} precision={m.expiry_precision ?? "day"} always />)}
        {m.subtype === "medicine" && active && row(t("active"), [active, m.strength].filter(Boolean).join(" · "))}
        {m.subtype === "medicine" && !active && m.strength && row(t("strength"), m.strength)}
        {m.subtype === "supplement" && m.components.length > 0 &&
          row(
            t("components"),
            <ul className="flex flex-col">
              {m.components.map((c, i) => (
                <li key={i}>
                  {pickText(c.name_local, c.name_en, slot)}
                  {c.amount && <span className="text-muted"> · {c.amount}</span>}
                </li>
              ))}
            </ul>,
          )}
        {form && row(t("form"), form)}
        {m.for_whom && row(t("forWhom"), m.for_whom)}
        {(uses || warnings) && (
          <div className="flex flex-col gap-2">
            {uses && row(t("uses"), <span className="whitespace-pre-line">{uses}</span>)}
            {warnings && row(t("warnings"), <span className="whitespace-pre-line">{warnings}</span>)}
            <SourceNote source={m.source} />
          </div>
        )}
        {m.ndc && row("NDC", <span className="tabular-nums select-all">{m.ndc}</span>)}
      </dl>
      <MedicineDisclaimer subtype={m.subtype} />
    </section>
  );
}
