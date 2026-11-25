"use client";

import { useEffect, useRef, useState } from "react";
import {
  BookOpen,
  CheckSquare,
  ChevronDown,
  ChevronsDownUp,
  ChevronsUpDown,
  Gauge,
  Languages,
  LayoutGrid,
  MapPin,
  Mic,
  Package,
  Pill,
  Plus,
  ScanSearch,
  Smartphone,
  UserCog,
  type LucideIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { HELP_TOPICS, type HelpTopic } from "@/lib/help/topics";

const ICONS: Record<HelpTopic, LucideIcon> = {
  start: Smartphone,
  add: Plus,
  multi: ScanSearch,
  voice: Mic,
  places: MapPin,
  items: LayoutGrid,
  books: BookOpen,
  medicines: Pill,
  bulk: CheckSquare,
  languages: Languages,
  plan: Gauge,
  account: UserCog,
};

/**
 * The help itself (texts from the "help" dictionaries), shared by the /help page and the help
 * sheet opened by "?": intro, contents, "Expand all", one collapsible section per topic.
 * `initial`: the section to open and scroll to (the screen the help was opened from).
 * On the page the contents are #links (shareable); in the sheet they only scroll the sheet.
 */
export function HelpContent({ initial = null, inSheet = false }: { initial?: HelpTopic | null; inSheet?: boolean }) {
  const t = useTranslations("help");
  const tApp = useTranslations("app");
  const root = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const idOf = (topic: HelpTopic) => (inSheet ? `help-sheet-${topic}` : topic);

  const sections = () => [...(root.current?.querySelectorAll<HTMLDetailsElement>("details[data-help-section]") ?? [])];
  const openTopic = (topic: string) => {
    const el = root.current?.querySelector<HTMLDetailsElement>(`details[data-topic="${topic}"]`);
    if (!el) return;
    el.open = true;
    // In the sheet only its own scroll area moves (scrollIntoView would also shift the sheet
    // itself and hide its header); on the page the window scrolls.
    const scroller = el.closest<HTMLElement>("[data-help-scroll]");
    if (scroller) scroller.scrollTop += el.getBoundingClientRect().top - scroller.getBoundingClientRect().top - 8;
    else el.scrollIntoView({ block: "start" });
  };

  // The section of the screen the help was opened from: open and show it — on the next frame,
  // when the sheet (a parent's effect opens it after this one runs) is on screen.
  useEffect(() => {
    if (!initial) return;
    const frame = requestAnimationFrame(() => openTopic(initial));
    return () => cancelAnimationFrame(frame);
    // Only when the help appears.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The page: a #link (contents, or from elsewhere) opens its section.
  useEffect(() => {
    if (inSheet) return;
    const fromHash = () => {
      const id = decodeURIComponent(location.hash.slice(1));
      if (id) openTopic(id);
    };
    fromHash();
    window.addEventListener("hashchange", fromHash);
    return () => window.removeEventListener("hashchange", fromHash);
  }, [inSheet]);

  return (
    <div ref={root} className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <span className="flex size-12 items-center justify-center rounded-2xl bg-accent text-accent-foreground">
          <Package className="size-6" aria-hidden />
        </span>
        <h1 className="text-2xl font-semibold tracking-tight">
          {t("title")} · {tApp("name")}
        </h1>
        <p className="text-muted">{t("intro")}</p>
      </div>

      <nav aria-label={t("contents")}>
        <ul className="flex flex-wrap gap-2">
          {HELP_TOPICS.map((key) => {
            const Icon = ICONS[key];
            return (
              <li key={key}>
                <a
                  href={`#${idOf(key)}`}
                  onClick={(e) => {
                    // In the sheet the address must not change: only scroll the sheet.
                    if (!inSheet) return;
                    e.preventDefault();
                    openTopic(key);
                  }}
                  className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-border px-3 text-sm"
                >
                  <Icon className="size-4 text-accent" aria-hidden />
                  {t(`sections.${key}.title`)}
                </a>
              </li>
            );
          })}
        </ul>
      </nav>

      <button
        type="button"
        onClick={() => {
          const next = !expanded;
          sections().forEach((d) => (d.open = next));
          setExpanded(next);
        }}
        className="-my-3 inline-flex min-h-11 w-fit items-center gap-1.5 self-end rounded-xl px-2 text-sm font-medium text-accent"
      >
        {expanded ? <ChevronsDownUp className="size-4" aria-hidden /> : <ChevronsUpDown className="size-4" aria-hidden />}
        {expanded ? t("collapseAll") : t("expandAll")}
      </button>

      <div className="flex flex-col gap-3">
        {HELP_TOPICS.map((key, i) => {
          const Icon = ICONS[key];
          return (
            // Closed by default; the contents, a #link or the screen the help came from open one.
            <details
              key={key}
              id={idOf(key)}
              data-topic={key}
              data-help-section
              className="group scroll-mt-16 rounded-2xl border border-border"
            >
              <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 p-3 text-lg font-semibold [&::-webkit-details-marker]:hidden">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-surface text-accent">
                  <Icon className="size-5" aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="sr-only">{i + 1}. </span>
                  {t(`sections.${key}.title`)}
                </span>
                <ChevronDown className="size-5 shrink-0 text-muted transition-transform group-open:rotate-180" aria-hidden />
              </summary>
              <ul className="flex flex-col gap-2.5 px-4 pb-4 pl-5">
                {(t.raw(`sections.${key}.points`) as string[]).map((point) => (
                  <li key={point} className="flex gap-2.5 leading-snug">
                    <span className="mt-2 size-1.5 shrink-0 rounded-full bg-accent" aria-hidden />
                    <span>{point}</span>
                  </li>
                ))}
              </ul>
            </details>
          );
        })}
      </div>
    </div>
  );
}
