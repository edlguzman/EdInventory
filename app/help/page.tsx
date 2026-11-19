import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowLeft,
  Camera,
  FolderTree,
  LayoutGrid,
  Lightbulb,
  MapPin,
  Package,
  Search,
  Smartphone,
  Tags,
  UserCheck,
  type LucideIcon,
} from "lucide-react";
import { getTranslations } from "next-intl/server";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { getUser } from "@/lib/auth";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("help");
  return { title: t("title") };
}

const SECTIONS: { key: "approval" | "install" | "places" | "here" | "add" | "find" | "views" | "categories" | "tips"; icon: LucideIcon }[] = [
  { key: "approval", icon: UserCheck },
  { key: "install", icon: Smartphone },
  { key: "places", icon: FolderTree },
  { key: "here", icon: MapPin },
  { key: "add", icon: Camera },
  { key: "find", icon: Search },
  { key: "views", icon: LayoutGrid },
  { key: "categories", icon: Tags },
  { key: "tips", icon: Lightbulb },
];

/**
 * Short how-to, readable without an account (public in proxy.ts), on a phone screen:
 * one card per topic, an icon and 2–4 short lines from the dictionaries.
 */
export default async function HelpPage() {
  const [t, tApp, user] = await Promise.all([getTranslations("help"), getTranslations("app"), getUser()]);
  const back = user ? { href: "/", label: t("toApp") } : { href: "/login", label: t("toLogin") };

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col">
      <header className="sticky top-0 z-30 flex items-center gap-2 border-b border-border bg-background/95 px-2 pt-[env(safe-area-inset-top)] backdrop-blur">
        <Link href={back.href} className="flex min-h-12 items-center gap-1.5 rounded-xl px-2 text-sm font-medium text-accent">
          <ArrowLeft className="size-5" aria-hidden />
          {back.label}
        </Link>
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

        {SECTIONS.map(({ key, icon: Icon }, i) => (
          <section
            key={key}
            id={key}
            aria-labelledby={`${key}-title`}
            className="scroll-mt-16 rounded-2xl border border-border p-4"
          >
            <h2 id={`${key}-title`} className="mb-3 flex items-center gap-3 text-lg font-semibold">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-surface text-accent">
                <Icon className="size-5" aria-hidden />
              </span>
              <span>
                <span className="sr-only">{i + 1}. </span>
                {t(`sections.${key}.title`)}
              </span>
            </h2>
            <ul className="flex flex-col gap-2 pl-1">
              {(t.raw(`sections.${key}.points`) as string[]).map((point) => (
                <li key={point} className="flex gap-2.5 leading-snug">
                  <span className="mt-2 size-1.5 shrink-0 rounded-full bg-accent" aria-hidden />
                  <span>{point}</span>
                </li>
              ))}
            </ul>
          </section>
        ))}

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
