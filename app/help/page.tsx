import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { getUser } from "@/lib/auth";
import { BackLink } from "@/components/back-button";
import { HelpContent } from "@/components/help/help-content";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("help");
  return { title: t("title") };
}

/**
 * Short how-to, readable without an account (public in proxy.ts), on a phone screen:
 * the same content as the "?" sheet (HelpContent), with #links to its sections.
 */
export default async function HelpPage() {
  const [t, user] = await Promise.all([getTranslations("help"), getUser()]);
  // Signed in: a real step back when possible, else Settings (where Help is linked from).
  const back = user ? { href: "/settings", label: t("toApp") } : { href: "/login", label: t("toLogin") };

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col">
      <header className="sticky top-0 z-30 flex items-center gap-2 border-b border-border bg-background/95 px-2 pt-[env(safe-area-inset-top)] backdrop-blur">
        <BackLink fallback={back.href} label={back.label} />
        {/* Guests only: a signed-in user's interface is "my language" (Settings). */}
        {!user && (
          <div className="ml-auto py-1">
            <LocaleSwitcher />
          </div>
        )}
      </header>

      <main className="flex flex-col gap-6 px-4 pt-5 pb-[max(2rem,env(safe-area-inset-bottom))]">
        <HelpContent />

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
