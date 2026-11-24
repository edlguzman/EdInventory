"use client";

import { useState, useTransition } from "react";
import { Bot, HardDrive, Trash2 } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { deleteAiPrice, setAiPrice, setStorageLimit, type AdminActionResult } from "@/app/(app)/admin/actions";
import { Alert, Button } from "@/components/ui/buttons";
import type { AiKindUsage, AiPrice, UsageOverview, UsageSettings } from "@/lib/admin/data";

const MB = 1024 ** 2;
const GB = 1024 ** 3;
const field =
  "min-h-11 w-full min-w-0 rounded-lg border border-border bg-background px-3 text-base text-foreground outline-none focus:border-accent";

/** "149 MB", "1.5 GB" and "$0.42" in the interface language. */
export function useAmounts() {
  const format = useFormatter();
  return {
    bytes: (n: number) =>
      n >= GB
        ? format.number(n / GB, { style: "unit", unit: "gigabyte", maximumFractionDigits: 2 })
        : n >= MB
          ? format.number(n / MB, { style: "unit", unit: "megabyte", maximumFractionDigits: n >= 100 * MB ? 0 : 1 })
          : format.number(n / 1024, { style: "unit", unit: "kilobyte", maximumFractionDigits: 0 }),
    // Small sums keep their digits: $0.0012 is not $0.00.
    usd: (n: number) => format.number(n, { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: n > 0 && n < 1 ? 4 : 2 }),
  };
}

/**
 * An estimated cost with what it leaves out. Nothing priced at all shows as "no price" / "no
 * data" instead of $0.
 */
export function useCost() {
  const t = useTranslations("admin");
  const { usd } = useAmounts();
  return (u: { cost: number; requests: number; noTokens: number; noPrice: number }) => {
    const priced = u.requests - u.noTokens - u.noPrice;
    const notes = [
      u.noTokens > 0 && t("costNoTokens", { count: u.noTokens }),
      u.noPrice > 0 && t("costNoPrice", { count: u.noPrice }),
    ].filter((x): x is string => !!x);
    return { text: u.requests === 0 ? usd(0) : priced > 0 ? `≈\u00a0${usd(u.cost)}` : "—", notes };
  };
}

const card = "flex min-h-28 flex-col gap-2 rounded-2xl border border-border p-4";
const icon = "flex size-12 shrink-0 items-center justify-center rounded-xl bg-surface text-accent";

/** Admin home: storage used of the limit, database size; AI cost over 30 days. */
export function UsageCards({ usage }: { usage: UsageOverview }) {
  const t = useTranslations("admin");
  const { bytes, usd } = useAmounts();
  const cost = useCost();
  const share = usage.storage_limit_bytes > 0 ? usage.storage_bytes / usage.storage_limit_bytes : 0;
  const c = cost({ cost: usage.ai_cost_30d, requests: usage.ai_requests_30d, noTokens: usage.ai_no_tokens_30d, noPrice: usage.ai_no_price_30d });
  const known = c.text.startsWith("≈");
  return (
    <>
      <section className={card} data-card="storage">
        <div className="flex items-center gap-4">
          <span className={icon}>
            <HardDrive className="size-6" aria-hidden />
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <h2 className="text-lg font-semibold">{t("storage")}</h2>
            <p className="text-sm text-muted tabular-nums">
              {t("storageOf", { used: bytes(usage.storage_bytes), limit: bytes(usage.storage_limit_bytes), percent: Math.round(share * 100) })}
            </p>
          </div>
        </div>
        <div
          role="progressbar"
          aria-label={t("storage")}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.min(100, Math.round(share * 100))}
          className="h-2 overflow-hidden rounded-full bg-surface"
        >
          <div className={`h-full ${share >= 0.9 ? "bg-red-600" : "bg-accent"}`} style={{ width: `${Math.min(100, share * 100)}%` }} />
        </div>
        <p className="text-sm text-muted tabular-nums">{t("database", { size: bytes(usage.db_bytes) })}</p>
      </section>

      <section className={card} data-card="ai">
        <div className="flex items-center gap-4">
          <span className={icon}>
            <Bot className="size-6" aria-hidden />
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <h2 className="text-lg font-semibold">{t("ai30d")}</h2>
            <p className="text-2xl font-semibold tabular-nums">{c.text}</p>
          </div>
        </div>
        <p className="text-sm text-muted tabular-nums">
          {t("aiRequests30d", { count: usage.ai_requests_30d })}
          {" · "}
          {t("aiAverage", {
            average: known && usage.ai_active_users_30d > 0 ? `≈ ${usd(usage.ai_cost_30d / usage.ai_active_users_30d)}` : "—",
            count: usage.ai_active_users_30d,
          })}
        </p>
        {c.notes.length > 0 && <p className="text-xs text-muted">{c.notes.join(" ")}</p>}
      </section>
    </>
  );
}

const KINDS = ["recognize", "voice_place", "search", "translate", "transcribe", "categorize"] as const;

/** A user's AI requests over 30 days by kind. */
export function AiKinds({ kinds }: { kinds: AiKindUsage[] }) {
  const t = useTranslations("admin");
  const { usd } = useAmounts();
  if (kinds.length === 0) return <p className="text-sm text-muted">{t("noAi30d")}</p>;
  return (
    <table className="w-full text-sm" data-kinds>
      <caption className="pb-1 text-left text-xs text-muted">{t("byKind")}</caption>
      <tbody className="divide-y divide-border">
        {kinds.map((k) => {
          const known = KINDS.find((x) => x === k.kind);
          return (
            <tr key={k.kind}>
              <th scope="row" className="py-1.5 text-left font-normal">
                {known ? t(`kind.${known}`) : k.kind}
              </th>
              <td className="py-1.5 pl-2 text-right tabular-nums">{k.n}</td>
              <td className="w-24 py-1.5 pl-2 text-right text-muted tabular-nums">{k.cost === null ? "—" : usd(k.cost)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/** "1,5" or "1.5" -> 1.5; "" -> null; anything else -> undefined. */
function amount(raw: string): number | null | undefined {
  const s = raw.trim().replace(",", ".");
  if (!s) return null;
  return /^\d+(\.\d+)?$/.test(s) ? Number(s) : undefined;
}

/** Storage limit and AI prices. */
export function UsageSettingsForm({ settings }: { settings: UsageSettings }) {
  const t = useTranslations("admin");
  return (
    <div className="flex flex-col gap-8">
      <StorageLimit bytes={settings.storage_limit_bytes} />
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">{t("prices")}</h2>
        <p className="text-sm text-muted">{t("pricesIntro")}</p>
        {settings.models.map((m) => (
          <ModelPrices key={m} model={m} prices={settings.prices.filter((p) => p.model === m)} />
        ))}
        {/* Prices of models that are neither configured nor used any more. */}
        {[...new Set(settings.prices.map((p) => p.model))]
          .filter((m) => !settings.models.includes(m))
          .map((m) => (
            <ModelPrices key={m} model={m} prices={settings.prices.filter((p) => p.model === m)} />
          ))}
      </section>
    </div>
  );
}

function useRun() {
  const t = useTranslations("admin");
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string }>();
  const run = (action: () => Promise<AdminActionResult>, after?: () => void) =>
    start(async () => {
      setMessage(undefined);
      const r = await action();
      setMessage(r.ok ? { ok: true, text: t("saved") } : { ok: false, text: r.error === "invalid" ? t("settingsInvalid") : t(`errors.${r.error}`) });
      if (r.ok) after?.();
    });
  return { pending, run, message, setMessage };
}

function Message({ message }: { message?: { ok: boolean; text: string } }) {
  if (!message) return null;
  return message.ok ? (
    <p role="status" className="text-sm text-emerald-700 dark:text-emerald-300">
      {message.text}
    </p>
  ) : (
    <Alert>{message.text}</Alert>
  );
}

function StorageLimit({ bytes }: { bytes: number }) {
  const t = useTranslations("admin");
  const { pending, run, message, setMessage } = useRun();
  const [value, setValue] = useState(String(Number((bytes / GB).toFixed(3))));
  const save = () => {
    const gb = amount(value);
    if (!gb) return setMessage({ ok: false, text: t("settingsInvalid") });
    run(() => setStorageLimit(gb));
  };
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">{t("storage")}</h2>
      <label className="flex flex-col gap-1 text-sm">
        {t("storageLimit")}
        <span className="flex gap-2">
          <input inputMode="decimal" value={value} maxLength={10} onChange={(e) => setValue(e.target.value)} className={field} />
          <Button variant="primary" pending={pending} onClick={save}>
            {t("save")}
          </Button>
        </span>
      </label>
      <p className="text-sm text-muted">{t("storageLimitHint")}</p>
      <Message message={message} />
    </section>
  );
}

function ModelPrices({ model, prices }: { model: string; prices: AiPrice[] }) {
  const t = useTranslations("admin");
  const format = useFormatter();
  const { usd } = useAmounts();
  const { pending, run, message, setMessage } = useRun();
  const [from, setFrom] = useState("");
  const [input, setInput] = useState("");
  const [audio, setAudio] = useState("");
  const [output, setOutput] = useState("");
  const add = () => {
    const [i, a, o] = [amount(input), amount(audio), amount(output)];
    if (!from || i == null || o == null || a === undefined) return setMessage({ ok: false, text: t("settingsInvalid") });
    run(
      () => setAiPrice({ model, valid_from: from, input: i, audio: a, output: o }),
      () => {
        setFrom("");
        setInput("");
        setAudio("");
        setOutput("");
      },
    );
  };
  const day = (iso: string) => format.dateTime(new Date(`${iso}T00:00:00Z`), { dateStyle: "medium", timeZone: "UTC" });
  const price = (label: string, value: string, set: (v: string) => void, placeholder?: string) => (
    <label className="flex min-w-0 flex-col gap-1 text-xs text-muted">
      {label}
      <input inputMode="decimal" value={value} maxLength={12} placeholder={placeholder} onChange={(e) => set(e.target.value)} className={field} />
    </label>
  );
  return (
    <div data-model={model} className="flex flex-col gap-3 rounded-2xl border border-border p-3">
      <h3 className="font-medium break-all">{model}</h3>
      {prices.length === 0 ? (
        <p className="text-sm text-amber-700 dark:text-amber-300">{t("noPrice")}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border">
          {prices.map((p) => (
            <li key={p.valid_from} className="flex items-center gap-2 py-1">
              <p className="min-w-0 flex-1 text-sm tabular-nums">
                <span className="block font-medium">{t("priceFrom", { date: day(p.valid_from) })}</span>
                <span className="block text-muted">
                  {t("priceLine", { input: usd(p.input), output: usd(p.output) })}
                  {p.audio !== null && ` · ${t("priceAudioLine", { audio: usd(p.audio) })}`}
                </span>
              </p>
              <button
                type="button"
                disabled={pending}
                onClick={() => run(() => deleteAiPrice(p.model, p.valid_from))}
                aria-label={`${t("delete")}: ${t("priceFrom", { date: day(p.valid_from) })}`}
                className="flex size-11 shrink-0 items-center justify-center rounded-xl text-red-600 disabled:opacity-40 dark:text-red-400"
              >
                <Trash2 className="size-5" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="grid grid-cols-2 gap-2">
        <label className="flex min-w-0 flex-col gap-1 text-xs text-muted">
          {t("validFrom")}
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={field} />
        </label>
        {price(t("priceInput"), input, setInput)}
        {price(t("priceOutput"), output, setOutput)}
        {price(t("priceAudio"), audio, setAudio, t("priceAudioHint"))}
      </div>
      <Button pending={pending} onClick={add}>
        {t("addPrice")}
      </Button>
      <Message message={message} />
    </div>
  );
}
