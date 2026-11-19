import type { ComponentProps } from "react";
import { LoaderCircle } from "lucide-react";

const base =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 font-medium transition-opacity disabled:opacity-50 active:opacity-80";

const variants = {
  primary: "bg-accent text-accent-foreground font-semibold",
  secondary: "border border-border bg-surface",
  danger: "bg-red-600 text-white font-semibold",
  ghost: "text-accent",
} as const;

export function Button({
  variant = "secondary",
  pending = false,
  className = "",
  children,
  disabled,
  ...props
}: ComponentProps<"button"> & { variant?: keyof typeof variants; pending?: boolean }) {
  return (
    <button
      type="button"
      disabled={disabled || pending}
      aria-busy={pending || undefined}
      className={`${base} ${variants[variant]} ${className}`}
      {...props}
    >
      {pending && <LoaderCircle className="size-5 animate-spin" aria-hidden />}
      {children}
    </button>
  );
}

export function Alert({ children, tone = "error" }: { children: React.ReactNode; tone?: "error" | "warning" }) {
  const styles =
    tone === "error"
      ? "border-red-300 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
      : "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200";
  return (
    <p role="alert" className={`rounded-xl border px-4 py-3 text-sm ${styles}`}>
      {children}
    </p>
  );
}
