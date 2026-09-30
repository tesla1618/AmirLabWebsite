import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export function FormField({
  children,
  className,
  description,
  htmlFor,
  label,
  labelClassName,
}: {
  children: ReactNode;
  className?: string;
  description?: ReactNode;
  htmlFor?: string;
  label?: ReactNode;
  labelClassName?: string;
}) {
  return (
    <div className={cn(className, "field grid content-start gap-1.5")}>
      {label ? (
        htmlFor ? (
          <label
            className={cn(
              labelClassName,
              "font-sans text-[11px] leading-[1.4] font-medium text-ink-muted",
            )}
            htmlFor={htmlFor}
          >
            {label}
          </label>
        ) : (
          <span
            className={cn(
              labelClassName,
              "font-sans text-[11px] leading-[1.4] font-medium text-ink-muted",
            )}
          >
            {label}
          </span>
        )
      ) : null}
      {children}
      {description ? (
        <p className="m-0 text-[.82rem] leading-[1.5] text-ink-muted">
          {description}
        </p>
      ) : null}
    </div>
  );
}

export function FormMessage({
  children,
  tone = "error",
}: {
  children: ReactNode;
  tone?: "error" | "info" | "muted" | "success";
}) {
  return (
    <p
      className={cn(
        "m-0 text-[.82rem] leading-[1.5]",
        tone === "error" &&
          "rounded-small border border-danger/25 bg-danger-soft p-[.8rem] text-danger",
        tone === "success" &&
          "rounded-small border border-success/25 bg-success-soft p-[.8rem] text-success",
        tone === "info" &&
          "rounded-small border border-info/25 bg-info-soft p-[.8rem] text-info",
        tone === "muted" && "text-ink-muted",
      )}
      role={
        tone === "error"
          ? "alert"
          : tone === "success" || tone === "info"
            ? "status"
            : undefined
      }
    >
      {children}
    </p>
  );
}
