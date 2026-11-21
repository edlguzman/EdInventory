"use client";

import { useEffect, useState } from "react";
import { ChevronsDownUp, ChevronsUpDown } from "lucide-react";

const sections = () => [...document.querySelectorAll<HTMLDetailsElement>("details[data-help-section]")];

/** A link to #section (contents, or a link from elsewhere) opens that section and scrolls to it. */
export function HelpOpenFromHash() {
  useEffect(() => {
    const open = () => {
      const id = decodeURIComponent(location.hash.slice(1));
      const el = id ? document.getElementById(id) : null;
      if (el instanceof HTMLDetailsElement) {
        el.open = true;
        el.scrollIntoView({ block: "start" });
      }
    };
    open();
    window.addEventListener("hashchange", open);
    return () => window.removeEventListener("hashchange", open);
  }, []);
  return null;
}

/** "Expand all" / "Collapse all" for the help sections. */
export function HelpExpandAll({ expandLabel, collapseLabel }: { expandLabel: string; collapseLabel: string }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        const next = !expanded;
        sections().forEach((d) => (d.open = next));
        setExpanded(next);
      }}
      className="-my-3 inline-flex min-h-11 w-fit items-center gap-1.5 self-end rounded-xl px-2 text-sm font-medium text-accent"
    >
      {expanded ? <ChevronsDownUp className="size-4" aria-hidden /> : <ChevronsUpDown className="size-4" aria-hidden />}
      {expanded ? collapseLabel : expandLabel}
    </button>
  );
}
