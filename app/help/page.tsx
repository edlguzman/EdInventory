import type { Metadata } from "next";
import Link from "next/link";
import {
  BookOpen,
  Camera,
  CheckSquare,
  ChevronDown,
  Gauge,
  Languages,
  LayoutGrid,
  MapPin,
  Mic,
  Package,
  ScanSearch,
  Smartphone,
  UserCog,
  type LucideIcon,
} from "lucide-react";
import { getTranslations } from "next-intl/server";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { getUser } from "@/lib/auth";
import { BackLink } from "@/components/back-button";
import { HelpExpandAll, HelpOpenFromHash } from "@/components/help-sections";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("help");
  return { title: t("title") };
}

/** Sections by what the user wants to do (texts in the "help" dictionaries). Admin is not described here. */
const SECTIONS = [
  { key: "start", icon: Smartphone },
  { key: "add", icon: Camera },
  { key: "multi", icon: ScanSearch },
  { key: "voice", icon: Mic },
  { key: "places", icon: MapPin },
  { key: "items", icon: LayoutGrid },
  { key: "books", icon: BookOpen },
  { key: "bulk", icon: CheckSquare },
  { key: "languages", icon: Languages },
  { key: "plan", icon: Gauge },
  { key: "account", icon: UserCog },
] as const satisfies readonly { key: string; icon: LucideIcon }[];

/**
 * Short how-to, readable without an account (public in proxy.ts), on a phone screen:
 * one card per topic, an icon and 2–4 short lines from the dictionaries.
 */
export default async function HelpPage() {
  const [t, tApp, user] = await Promise.all([getTranslations("help"), getTranslations("app"), getUser()]);
  // Signed in: a real step back when possible, else Settings (where Help is linked from).
  const back = user ? { href: "/settings", label: t("toApp") } : { href: "/login", label: t("toLogin") };

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col">
      <header className="sticky top-0 z-30 flex items-center gap-2 border-b border-border bg-background/95 px-2 pt-[env(safe-area-inset-top)] backdrop-blur">
        <BackLink fallback={back.href} label={back.label} />
        <div className="ml-auto py-1">
          <LocaleSwitcher compact />
        </div>
      </header>

      <main className="flex flex-col gap-6 px-4 pt-5 pb-[max(2rem,env(safe-area-inset-bottom))]">
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
            {SECTIONS.map(({ key, icon: Icon }) => (
              <li key={key}>
                <a
                  href={`#${key}`}
                  className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-border px-3 text-sm"
                >
                  <Icon className="size-4 text-accent" aria-hidden />
                  {t(`sections.${key}.title`)}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <HelpExpandAll expandLabel={t("expandAll")} collapseLabel={t("collapseAll")} />
        <HelpOpenFromHash />

        <div className="flex flex-col gap-3">
          {SECTIONS.map(({ key, icon: Icon }, i) => (
            // Closed by default; a link from the contents opens its section (HelpOpenFromHash).
            <details key={key} id={key} className="group scroll-mt-16 rounded-2xl border border-border" data-help-section>
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
          ))}
        </div>

        <Link
          href={back.href}
          className="flex min-h-12 items-center justify-center rounded-xl bg-accent px-4 font-semibold text-accent-foreground"
        >
          {back.label}
        </Link>
      </main>
    </div>
  );
}
