"use client";

import { useEffect, useId, useRef } from "react";
import { X } from "lucide-react";
import { useTranslations } from "next-intl";

/**
 * Bottom sheet on mobile, centered dialog on wider screens. Built on <dialog>:
 * focus trap, Escape and the top layer come from the browser.
 */
export function Sheet({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const t = useTranslations("common");
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      // A click on the dialog element itself (not its content) is a click on the backdrop.
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      aria-labelledby={titleId}
      className="m-0 mt-auto max-h-[88dvh] w-full max-w-none flex-col rounded-t-2xl bg-background text-foreground shadow-xl backdrop:bg-black/40 open:flex not-open:hidden sm:m-auto sm:max-w-lg sm:rounded-2xl"
    >
      {open && (
        <>
          <div className="flex items-center gap-2 border-b border-border py-1 pr-1 pl-4">
            <h2 id={titleId} className="min-w-0 flex-1 truncate font-semibold">
              {title}
            </h2>
            <button
              type="button"
              onClick={onClose}
              aria-label={t("close")}
              className="flex size-11 items-center justify-center rounded-xl text-muted"
            >
              <X className="size-5" aria-hidden />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">{children}</div>
          {footer && (
            <div className="border-t border-border p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">{footer}</div>
          )}
          {!footer && <div className="pb-[env(safe-area-inset-bottom)]" />}
        </>
      )}
    </dialog>
  );
}
