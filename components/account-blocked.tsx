import Link from "next/link";
import { Ban, CircleHelp, Clock, LogOut, RotateCw } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { signOut } from "@/app/(auth)/actions";
import type { AccountStatus } from "@/lib/auth";

/**
 * The only screen a pending or disabled account sees after signing in. The real
 * block is in the database (RLS, consume_ai_quota): this screen just explains it.
 */
export async function AccountBlocked({ status, email }: { status: Exclude<AccountStatus, "active">; email: string }) {
  const t = await getTranslations("blocked");
  const tSettings = await getTranslations("settings");
  const Icon = status === "pending" ? Clock : Ban;

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-5 px-4 pt-[max(2rem,env(safe-area-inset-top))] pb-[max(2rem,env(safe-area-inset-bottom))]">
      <span
        className={`flex size-14 items-center justify-center rounded-2xl ${
          status === "pending"
            ? "bg-accent text-accent-foreground"
            : "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300"
        }`}
      >
        <Icon className="size-7" aria-hidden />
      </span>
      <h1 className="text-2xl font-semibold tracking-tight">{t(`${status}Title`)}</h1>
      <p className="text-muted">{t(`${status}Text`)}</p>
      <p className="rounded-xl border border-border bg-surface px-4 py-3">
        <span className="block text-sm text-muted">{tSettings("signedInAs")}</span>
        <span className="break-all font-medium">{email}</span>
      </p>
      <div className="flex flex-col gap-2">
        {status === "pending" && (
          // A full page load on purpose: the layout must read the status again.
          // eslint-disable-next-line @next/next/no-html-link-for-pages
          <a
            href="/"
            className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-accent px-4 font-semibold text-accent-foreground"
          >
            <RotateCw className="size-5" aria-hidden />
            {t("refresh")}
          </a>
        )}
        <form action={signOut}>
          <button
            type="submit"
            className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-border px-4 font-medium"
          >
            <LogOut className="size-5" aria-hidden />
            {tSettings("signOut")}
          </button>
        </form>
        <Link href="/help" className="flex min-h-11 items-center justify-center gap-2 text-sm font-medium text-accent">
          <CircleHelp className="size-5" aria-hidden />
          {tSettings("help")}
        </Link>
      </div>
    </main>
  );
}
