"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { useTranslations } from "next-intl";
import { useLocations } from "@/components/locations/locations-context";
import { canGoBackInApp, installNavHistory, useBackOverride } from "@/lib/nav-history";

/**
 * Where "Back" goes when there is no previous app screen in this tab (opened by a link,
 * first screen of the installed app): the screen's logical parent. null = a top-level tab
 * (no back arrow there).
 */
function useParentPath(): string | null {
  const pathname = usePathname();
  const { byId } = useLocations();
  let m = pathname.match(/^\/items\/([^/]+)\/edit$/);
  if (m) return `/items/${m[1]}`;
  if (/^\/items\/[^/]+$/.test(pathname)) return "/";
  m = pathname.match(/^\/locations\/([^/]+)$/);
  if (m) {
    const parent = byId.get(m[1])?.parentId;
    return parent ? `/locations/${parent}` : "/locations";
  }
  if (pathname === "/admin") return "/settings";
  if (pathname === "/admin/users" || pathname === "/admin/plans") return "/admin";
  return null;
}

/** "Back" arrow in the header of inner screens: a real history step when possible, else the parent. */
export function HeaderBack() {
  const t = useTranslations("common");
  const router = useRouter();
  const parent = useParentPath();
  const override = useBackOverride();
  useEffect(installNavHistory, []);
  if (!override && !parent) return null;

  return (
    <button
      type="button"
      aria-label={t("back")}
      onClick={() => {
        if (override) override();
        else if (canGoBackInApp()) router.back();
        else router.push(parent!);
      }}
      className="flex size-11 shrink-0 items-center justify-center rounded-xl text-accent"
    >
      <ArrowLeft className="size-6" aria-hidden />
    </button>
  );
}

/** "Back" on a page with its own header (/help): history step if possible, else `fallback`. */
export function BackLink({ fallback, label }: { fallback: string; label: string }) {
  const router = useRouter();
  useEffect(installNavHistory, []);
  return (
    <a
      href={fallback}
      onClick={(e) => {
        e.preventDefault();
        if (canGoBackInApp()) router.back();
        else router.push(fallback);
      }}
      className="flex min-h-12 items-center gap-1.5 rounded-xl px-2 text-sm font-medium text-accent"
    >
      <ArrowLeft className="size-5" aria-hidden />
      {label}
    </a>
  );
}
