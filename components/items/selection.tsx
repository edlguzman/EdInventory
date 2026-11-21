"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { Check, CheckCheck, LoaderCircle, X } from "lucide-react";
import { useTranslations } from "next-intl";

/**
 * Selection of items for bulk edit (Items list and Search results). Kept in the component that
 * shows the list: a new filter, leaving the page or finishing an action ends it.
 */
export function useItemSelection() {
  const [active, setActive] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  /** "Select all found" picked only the first `shown` of `total`. */
  const [capped, setCapped] = useState<{ shown: number; total: number } | null>(null);
  return {
    active,
    selected,
    capped,
    /** Enter selection mode (long press: with that item selected). */
    start: (id?: string) => {
      setActive(true);
      if (id) setSelected((s) => new Set(s).add(id));
    },
    toggle: (id: string) =>
      setSelected((s) => {
        const next = new Set(s);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      }),
    selectAll: (ids: string[], total: number) => {
      setActive(true);
      setSelected(new Set(ids));
      setCapped(total > ids.length ? { shown: ids.length, total } : null);
    },
    exit: () => {
      setActive(false);
      setSelected(new Set());
      setCapped(null);
    },
  };
}

export type ItemSelection = ReturnType<typeof useItemSelection>;

const LONG_PRESS_MS = 500;
const MOVE_TOLERANCE_PX = 10;

/**
 * A card link that also selects: in selection mode a tap ticks the item instead of opening it;
 * a long press (~0.5 s, finger not moving) starts selection mode with this item. The system
 * long-press menu of links and images (iOS preview, "Open in new tab") is suppressed.
 */
export function SelectableLink({
  id,
  href,
  className,
  selection,
  children,
}: {
  id: string;
  href: string;
  className?: string;
  selection?: ItemSelection;
  children: React.ReactNode;
}) {
  const timer = useRef<number | undefined>(undefined);
  const fired = useRef(false);
  const origin = useRef<{ x: number; y: number } | null>(null);
  const cancel = () => {
    window.clearTimeout(timer.current);
    timer.current = undefined;
  };

  if (!selection) {
    return (
      <Link href={href} className={className}>
        {children}
      </Link>
    );
  }

  const selected = selection.selected.has(id);
  return (
    <Link
      href={href}
      draggable={false}
      aria-current={selection.active && selected ? "true" : undefined}
      className={`${className ?? ""} select-none [-webkit-touch-callout:none] [&_img]:[-webkit-touch-callout:none]`}
      onPointerDown={(e) => {
        if (e.pointerType === "mouse" && e.button !== 0) return;
        fired.current = false;
        origin.current = { x: e.clientX, y: e.clientY };
        cancel();
        timer.current = window.setTimeout(() => {
          fired.current = true;
          if (selection.active) selection.toggle(id);
          else selection.start(id);
          navigator.vibrate?.(10);
        }, LONG_PRESS_MS);
      }}
      onPointerMove={(e) => {
        const o = origin.current;
        if (o && Math.hypot(e.clientX - o.x, e.clientY - o.y) > MOVE_TOLERANCE_PX) cancel();
      }}
      onPointerUp={cancel}
      onPointerCancel={cancel}
      onPointerLeave={cancel}
      onContextMenu={(e) => e.preventDefault()}
      onClick={(e) => {
        if (fired.current) {
          // The click that ends a long press does not open the item.
          e.preventDefault();
          fired.current = false;
          return;
        }
        if (selection.active) {
          e.preventDefault();
          selection.toggle(id);
        }
      }}
    >
      {children}
    </Link>
  );
}

/** The tick shown on a card in selection mode. */
export function SelectMark({ selected, className = "" }: { selected: boolean; className?: string }) {
  return (
    <span
      aria-hidden
      className={`flex size-7 items-center justify-center rounded-full border-2 shadow-sm ${
        selected ? "border-accent bg-accent text-accent-foreground" : "border-white bg-black/30"
      } ${className}`}
    >
      {selected && <Check className="size-4" strokeWidth={3} />}
    </span>
  );
}

/**
 * Top bar of selection mode: "Selected: N", "Select all found", "Cancel". Sticky under the app
 * header (44px + its border + the iPhone notch).
 */
export function SelectionHeader({
  selection,
  onSelectAll,
  selectingAll,
}: {
  selection: ItemSelection;
  onSelectAll: () => void;
  selectingAll: boolean;
}) {
  const t = useTranslations("bulk");
  return (
    <div className="sticky top-[calc(2.75rem+1px+env(safe-area-inset-top))] z-20 -mx-4 flex flex-col gap-1 border-b border-border bg-background/95 px-4 pt-1 pb-1 backdrop-blur">
      <div className="flex items-center gap-2">
        <span role="status" className="min-w-0 flex-1 truncate text-lg font-semibold">
          {t("selected", { count: selection.selected.size })}
        </span>
        <button
          type="button"
          onClick={selection.exit}
          aria-label={t("cancelSelection")}
          className="flex size-11 shrink-0 items-center justify-center rounded-xl text-muted"
        >
          <X className="size-5" aria-hidden />
        </button>
      </div>
      <button
        type="button"
        onClick={onSelectAll}
        disabled={selectingAll}
        className="-mt-2 -ml-2 inline-flex min-h-11 w-fit items-center gap-1.5 rounded-xl px-2 text-sm font-medium text-accent disabled:opacity-50"
      >
        {selectingAll ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <CheckCheck className="size-4" aria-hidden />}
        {t("selectAllFound")}
      </button>
      {selection.capped && (
        <p className="text-xs text-amber-800 dark:text-amber-200">
          {t("cappedNote", { shown: selection.capped.shown, total: selection.capped.total })}
        </p>
      )}
    </div>
  );
}
