"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Height of the screen the on-screen keyboard covers (0 when it is closed). Fixed elements are
 * placed against the layout viewport, which the keyboard does not shrink on iOS (and on Android
 * Chrome by default), so a bar at `bottom: <this>` sits right on top of the keyboard.
 */
function useKeyboardInset() {
  const [inset, setInset] = useState(0);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => {
      const covered = window.innerHeight - vv.height - vv.offsetTop;
      // Small differences are browser bars and pinch zoom, not a keyboard.
      setInset(covered > 120 ? Math.round(covered) : 0);
    };
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);
  return inset;
}

/**
 * Form buttons (Cancel / Save) pinned at the bottom of the screen: above the bottom menu, or
 * right above the keyboard while it is open. Renders a spacer of the same height in the page
 * so the last fields can scroll out from under the bar, and keeps the focused field visible.
 * Its parents must not have transform / filter / contain (see CLAUDE.md, iPhone).
 */
export function StickyActions({ children }: { children: ReactNode }) {
  const keyboard = useKeyboardInset();
  const bar = useRef<HTMLDivElement>(null);

  // A field that got focus (or the keyboard that just opened) must not end up under the bar.
  useEffect(() => {
    const reveal = () => {
      const el = document.activeElement;
      if (!(el instanceof HTMLElement) || !bar.current || bar.current.contains(el)) return;
      if (!el.matches("input, textarea, select, [contenteditable=true]")) return;
      const top = bar.current.getBoundingClientRect().top;
      const rect = el.getBoundingClientRect();
      const overlap = rect.bottom + 12 - top;
      if (overlap > 0) window.scrollBy({ top: overlap, behavior: "smooth" });
    };
    // After the keyboard animation the bar has moved: check again.
    const id = setTimeout(reveal, 350);
    const onFocus = () => setTimeout(reveal, 350);
    document.addEventListener("focusin", onFocus);
    return () => {
      clearTimeout(id);
      document.removeEventListener("focusin", onFocus);
    };
  }, [keyboard]);

  return (
    <>
      <div aria-hidden className="h-16 shrink-0" />
      <div
        ref={bar}
        style={keyboard ? { bottom: keyboard } : undefined}
        className={`fixed inset-x-0 z-30 transform-gpu border-t border-border bg-background/95 backdrop-blur ${
          keyboard ? "" : "bottom-[calc(4.5rem+env(safe-area-inset-bottom))]"
        }`}
      >
        <div className="mx-auto flex max-w-2xl gap-2 px-4 py-2">{children}</div>
      </div>
    </>
  );
}
