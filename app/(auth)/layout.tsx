import { Package } from "lucide-react";
import { useTranslations } from "next-intl";
import { HelpButton } from "@/components/help/help-sheet";
import { LocaleSwitcher } from "@/components/locale-switcher";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  const t = useTranslations("app");
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col px-4 pt-[max(1.5rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 font-semibold">
          <span className="flex size-9 items-center justify-center rounded-xl bg-accent text-accent-foreground">
            <Package className="size-5" aria-hidden />
          </span>
          {t("name")}
        </div>
        <div className="flex items-center gap-1">
          <LocaleSwitcher />
          <HelpButton topic="start" />
        </div>
      </div>
      <div className="flex flex-1 flex-col justify-center py-8">{children}</div>
    </main>
  );
}
