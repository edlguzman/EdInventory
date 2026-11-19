"use client";

import { RotateCw } from "lucide-react";

export function RetryButton({ label }: { label: string }) {
  return (
    <button
      type="button"
      onClick={() => window.location.reload()}
      className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-accent px-6 font-semibold text-accent-foreground"
    >
      <RotateCw className="size-5" aria-hidden />
      {label}
    </button>
  );
}
