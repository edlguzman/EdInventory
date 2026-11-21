"use client";

import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { ArrowLeft, CircleHelp } from "lucide-react";
import { useTranslations } from "next-intl";
import { topicForPath, type HelpTopic } from "@/lib/help/topics";
import { HelpContent } from "./help-content";

type HelpContextValue = {
  /** Opens the help over the current screen, on `topic` (default: the current screen's section). */
  open: (topic?: HelpTopic | null) => void;
  register: (id: string, topic: HelpTopic) => void;
  unregister: (id: string) => void;
};

const HelpContext = createContext<HelpContextValue | null>(null);

/** History entries pushed by the sheet carry this flag: "Back" then only closes the sheet. */
const SHEET_STATE = "__helpSheet";

/**
 * The help as a full-screen sheet over the current screen (not a page change): nothing on the
 * screen is unmounted, so a half-filled form, filters, scroll position and a selection stay.
 * Opening pushes a history entry with the same address, so Android "Back", the back gesture and
 * the browser's Back close the sheet; the arrow in the sheet does the same.
 */
export function HelpProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [shown, setShown] = useState<{ topic: HelpTopic | null; n: number } | null>(null);
  // Screens and blocks that know their section better than the address (last one wins).
  const stack = useRef<{ id: string; topic: HelpTopic }[]>([]);

  const register = useCallback((id: string, topic: HelpTopic) => {
    stack.current = [...stack.current.filter((e) => e.id !== id), { id, topic }];
  }, []);
  const unregister = useCallback((id: string) => {
    stack.current = stack.current.filter((e) => e.id !== id);
  }, []);

  const open = useCallback(
    (topic?: HelpTopic | null) => {
      const chosen = topic !== undefined ? topic : (stack.current.at(-1)?.topic ?? topicForPath(pathname));
      window.history.pushState({ ...(window.history.state ?? {}), [SHEET_STATE]: true }, "", window.location.href);
      setShown((s) => ({ topic: chosen, n: (s?.n ?? 0) + 1 }));
    },
    [pathname],
  );

  // "Back" (button, gesture, Android key) away from the sheet's entry closes it.
  useEffect(() => {
    if (!shown) return;
    const onPop = () => {
      if (!window.history.state?.[SHEET_STATE]) setShown(null);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [shown]);

  const close = useCallback(() => {
    if (window.history.state?.[SHEET_STATE]) window.history.back();
    else setShown(null);
  }, []);

  const value = useMemo(() => ({ open, register, unregister }), [open, register, unregister]);
  return (
    <HelpContext.Provider value={value}>
      {children}
      {shown && <HelpSheet key={shown.n} topic={shown.topic} onClose={close} />}
    </HelpContext.Provider>
  );
}

/** A screen or block states its help section while it is shown (and `active`). */
export function useHelpTopic(topic: HelpTopic, active = true) {
  const ctx = useContext(HelpContext);
  const id = useId();
  useEffect(() => {
    if (!ctx || !active) return;
    ctx.register(id, topic);
    return () => ctx.unregister(id);
  }, [ctx, id, topic, active]);
}

/**
 * The "?" that opens the help on the current screen's section. `topic` fixes the section
 * (a Settings block); `small` is the inline variant next to a heading (still a 44px target).
 */
export function HelpButton({ topic, small = false, className = "" }: { topic?: HelpTopic; small?: boolean; className?: string }) {
  const t = useTranslations("help");
  const ctx = useContext(HelpContext);
  if (!ctx) return null;
  return (
    <button
      type="button"
      onClick={() => ctx.open(topic)}
      aria-label={t("open")}
      title={t("open")}
      className={`flex size-11 shrink-0 items-center justify-center rounded-xl text-muted active:text-accent ${small ? "-my-3" : ""} ${className}`}
    >
      <CircleHelp className={small ? "size-4" : "size-5"} aria-hidden />
    </button>
  );
}

function HelpSheet({ topic, onClose }: { topic: HelpTopic | null; onClose: () => void }) {
  const t = useTranslations("help");
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  return (
    <dialog
      ref={ref}
      aria-label={t("title")}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      className="m-0 h-dvh max-h-none w-full max-w-none flex-col overflow-hidden bg-background p-0 text-foreground open:flex backdrop:bg-black/40"
    >
      <div className="flex shrink-0 items-center gap-2 border-b border-border bg-background/95 px-2 pt-[env(safe-area-inset-top)]">
        <button
          type="button"
          onClick={onClose}
          aria-label={t("close")}
          className="flex size-11 shrink-0 items-center justify-center rounded-xl text-accent"
        >
          <ArrowLeft className="size-6" aria-hidden />
        </button>
        <span className="min-w-0 flex-1 truncate font-semibold">{t("title")}</span>
      </div>
      {/* Only this part scrolls (min-h-0), so the header with the close arrow always stays. */}
      <div data-help-scroll className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className="mx-auto max-w-2xl px-4 pt-5 pb-[max(2rem,env(safe-area-inset-bottom))]">
          <HelpContent initial={topic} inSheet />
        </div>
      </div>
    </dialog>
  );
}
