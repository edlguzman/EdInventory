import { KeyRound, LogOut } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { signOut } from "@/app/(auth)/actions";
import { HelpButton } from "@/components/help/help-sheet";
import { CodeForm } from "./code-form";

/**
 * The only screen of an account with "sign-in with a code" until the code is entered in this
 * session. The real block is in the database (is_active()): this screen asks for the code.
 */
export async function CodeRequired({ email }: { email: string }) {
  const [t, tSettings] = await Promise.all([getTranslations("code"), getTranslations("settings")]);
  return (
    <main className="relative mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-5 px-4 pt-[max(2rem,env(safe-area-inset-top))] pb-[max(2rem,env(safe-area-inset-bottom))]">
      <HelpButton topic="account" className="absolute top-[max(0.5rem,env(safe-area-inset-top))] right-2" />
      <span className="flex size-14 items-center justify-center rounded-2xl bg-accent text-accent-foreground">
        <KeyRound className="size-7" aria-hidden />
      </span>
      <h1 className="text-2xl font-semibold tracking-tight">{t("askTitle")}</h1>
      <CodeForm intro={t("ask")} />
      <p className="text-sm text-muted">
        {tSettings("signedInAs")} <span className="font-medium break-all text-foreground">{email}</span>
      </p>
      <form action={signOut}>
        <button
          type="submit"
          className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-border px-4 font-medium"
        >
          <LogOut className="size-5" aria-hidden />
          {tSettings("signOut")}
        </button>
      </form>
    </main>
  );
}
