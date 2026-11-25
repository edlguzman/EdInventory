"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { MapPin, Package, Plus, Search, Settings, type LucideIcon } from "lucide-react";

type NavKey = "items" | "search" | "locations" | "settings";

const sideItems: { href: string; key: NavKey; icon: LucideIcon }[] = [
  { href: "/", key: "items", icon: Package },
  { href: "/search", key: "search", icon: Search },
  { href: "/locations", key: "locations", icon: MapPin },
  { href: "/settings", key: "settings", icon: Settings },
];

/** Inner screens outside their tab's address: an item belongs to "Items", the admin screens to "Settings". */
const extraPrefixes: Record<string, string> = { "/": "/items", "/settings": "/admin" };

function isActive(pathname: string, href: string) {
  const inside = (base: string) => pathname === base || pathname.startsWith(`${base}/`);
  if (href in extraPrefixes && inside(extraPrefixes[href])) return true;
  return href === "/" ? pathname === "/" : inside(href);
}

function NavLink({
  href,
  label,
  icon: Icon,
  active,
  badge,
}: {
  href: string;
  label: string;
  icon: LucideIcon;
  active: boolean;
  badge?: { count: number; label: string };
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-xs ${
        active ? "font-semibold text-accent dark:text-blue-400" : "text-muted dark:text-muted/80"
      }`}
    >
      <span
        className={`relative flex h-8 w-14 items-center justify-center rounded-full transition-colors ${
          active ? "bg-accent/15 dark:bg-accent/25" : ""
        }`}
      >
        <Icon className="size-6" strokeWidth={active ? 2.5 : 2} aria-hidden />
        {badge && (
          <span
            className="absolute -top-0.5 right-1.5 flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-red-600 px-1 text-[0.6875rem] leading-none font-semibold text-white"
            aria-hidden
          >
            {badge.count > 99 ? "99+" : badge.count}
          </span>
        )}
      </span>
      <span>{label}</span>
      {badge && <span className="sr-only">, {badge.label}</span>}
    </Link>
  );
}

/** settingsBadge: accounts awaiting approval (shown to the admin only, 0 hides it). */
export function BottomNav({ settingsBadge = 0 }: { settingsBadge?: number }) {
  const t = useTranslations("nav");
  const pathname = usePathname();
  const [left, right] = [sideItems.slice(0, 2), sideItems.slice(2)];
  const addActive = isActive(pathname, "/add");

  return (
    <nav
      aria-label={t("label")}
      className="fixed inset-x-0 bottom-0 z-40 transform-gpu border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"
    >
      <div className="mx-auto flex max-w-2xl items-end px-2">
        {left.map((item) => (
          <NavLink key={item.key} href={item.href} label={t(item.key)} icon={item.icon} active={isActive(pathname, item.href)} />
        ))}

        <div className="flex flex-1 justify-center">
          <Link
            href="/add"
            aria-label={t("add")}
            aria-current={addActive ? "page" : undefined}
            className={`-mt-6 mb-1 flex size-16 items-center justify-center rounded-full bg-accent text-accent-foreground shadow-lg ring-4 ring-background active:scale-95 transition-transform ${
              addActive ? "outline-3 outline-offset-4 outline-accent dark:outline-blue-400" : ""
            }`}
          >
            <Plus className="size-8" strokeWidth={2.5} aria-hidden />
          </Link>
        </div>

        {right.map((item) => (
          <NavLink
            key={item.key}
            href={item.href}
            label={t(item.key)}
            icon={item.icon}
            active={isActive(pathname, item.href)}
            badge={
              item.key === "settings" && settingsBadge > 0
                ? { count: settingsBadge, label: t("pendingBadge", { n: settingsBadge }) }
                : undefined
            }
          />
        ))}
      </div>
    </nav>
  );
}
