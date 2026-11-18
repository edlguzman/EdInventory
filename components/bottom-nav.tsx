"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { Camera, MapPin, Package, Search, Settings, type LucideIcon } from "lucide-react";

type NavKey = "items" | "search" | "locations" | "settings";

const sideItems: { href: string; key: NavKey; icon: LucideIcon }[] = [
  { href: "/", key: "items", icon: Package },
  { href: "/search", key: "search", icon: Search },
  { href: "/locations", key: "locations", icon: MapPin },
  { href: "/settings", key: "settings", icon: Settings },
];

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

function NavLink({ href, label, icon: Icon, active }: { href: string; label: string; icon: LucideIcon; active: boolean }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-xs ${
        active ? "text-accent" : "text-muted"
      }`}
    >
      <Icon className="size-6" aria-hidden />
      <span>{label}</span>
    </Link>
  );
}

export function BottomNav() {
  const t = useTranslations("nav");
  const pathname = usePathname();
  const [left, right] = [sideItems.slice(0, 2), sideItems.slice(2)];
  const addActive = isActive(pathname, "/add");

  return (
    <nav
      aria-label={t("label")}
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"
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
            className="-mt-6 mb-1 flex size-16 items-center justify-center rounded-full bg-accent text-accent-foreground shadow-lg ring-4 ring-background active:scale-95 transition-transform"
          >
            <Camera className="size-7" aria-hidden />
          </Link>
        </div>

        {right.map((item) => (
          <NavLink key={item.key} href={item.href} label={t(item.key)} icon={item.icon} active={isActive(pathname, item.href)} />
        ))}
      </div>
    </nav>
  );
}
