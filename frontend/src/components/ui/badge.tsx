import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { loadingPlaceholder } from "@/lib/loading-style";

export type BadgeTone = "success" | "warning" | "info" | "error" | "neutral";

const toneClass: Record<BadgeTone, string> = {
  success: "border-success/25 bg-success-soft text-success",
  warning: "border-warning/25 bg-warning-soft text-warning",
  info: "border-info/25 bg-info-soft text-info",
  error: "border-danger/25 bg-danger-soft text-danger",
  neutral: "border-line-strong bg-surface text-ink-muted",
};

const dotClass: Record<BadgeTone, string> = {
  success: "bg-success",
  warning: "bg-warning",
  info: "bg-info",
  error: "bg-danger",
  neutral: "bg-ink-muted",
};

export function Badge({
  children,
  dot = false,
  live = false,
  tone = "neutral",
  loading = false,
}: {
  children: ReactNode;
  dot?: boolean;
  live?: boolean;
  tone?: BadgeTone;
  loading?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex min-h-6 w-fit items-center gap-[5px] whitespace-nowrap rounded-[var(--radius-small)] border px-2 py-0.5 font-mono text-[10px] font-medium tracking-[.035em]",
        toneClass[tone],
        live && "animate-[badge-pulse_2s_infinite] motion-reduce:animate-none",
        loading && loadingPlaceholder(true, "label"),
      )}
      data-loading={loading || undefined}
      data-placeholder={loading ? "label" : undefined}
    >
      {dot ? (
        <span
          aria-hidden="true"
          className={cn("h-1.5 w-1.5 rounded-full", dotClass[tone])}
        />
      ) : null}
      {children}
    </span>
  );
}
