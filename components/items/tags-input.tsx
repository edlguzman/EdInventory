"use client";

import { useId, useState } from "react";
import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import { TAG_MAX, TAGS_MAX } from "@/lib/validation/items";

/** Tag chips: Enter or comma adds, Backspace on an empty input removes the last one. No duplicates. */
export function TagsInput({ value, onChange }: { value: string[]; onChange: (tags: string[]) => void }) {
  const t = useTranslations("items");
  const id = useId();
  const [draft, setDraft] = useState("");

  function commit(raw: string) {
    const parts = raw
      .split(",")
      .map((s) => s.trim().slice(0, TAG_MAX))
      .filter(Boolean);
    if (parts.length === 0) return;
    const next = [...value];
    for (const p of parts) {
      if (next.length >= TAGS_MAX) break;
      if (!next.some((x) => x.toLowerCase() === p.toLowerCase())) next.push(p);
    }
    onChange(next);
    setDraft("");
  }

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {t("tags")}
      </label>
      <div className="flex min-h-12 flex-wrap items-center gap-1.5 rounded-xl border border-border bg-surface px-2 py-1.5 focus-within:border-accent">
        {value.map((tag) => (
          <span key={tag} className="inline-flex items-center rounded-lg bg-background pl-2.5 text-sm">
            {tag}
            <button
              type="button"
              onClick={() => onChange(value.filter((x) => x !== tag))}
              aria-label={t("removeTag", { tag })}
              className="flex size-8 items-center justify-center text-muted"
            >
              <X className="size-4" aria-hidden />
            </button>
          </span>
        ))}
        <input
          id={id}
          value={draft}
          enterKeyHint="enter"
          autoComplete="off"
          placeholder={value.length === 0 ? t("tagsPlaceholder") : undefined}
          onChange={(e) => {
            const v = e.target.value;
            if (v.includes(",")) commit(v);
            else setDraft(v);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit(draft);
            } else if (e.key === "Backspace" && draft === "" && value.length > 0) {
              onChange(value.slice(0, -1));
            }
          }}
          onBlur={() => commit(draft)}
          className="min-h-9 min-w-24 flex-1 bg-transparent px-1 text-base outline-none"
        />
      </div>
      <p className="text-sm text-muted">{t("tagsHint")}</p>
    </div>
  );
}
