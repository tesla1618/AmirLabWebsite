import { forwardRef } from "react";
import type { ComponentPropsWithRef } from "react";
import { cn } from "@/lib/cn";
import { loadingPlaceholder } from "@/lib/loading-style";

export const formControlClass =
  "h-[var(--control-height)] min-h-[var(--control-height)] w-full rounded-[var(--radius-control)] border border-line-strong bg-surface px-3 py-0 [font-size:var(--control-text-size)] font-normal leading-[1.45] text-ink transition-[border-color,box-shadow,background] duration-150 placeholder:text-ink-faint hover:not-disabled:border-line-strong focus-visible:border-brand focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)] aria-invalid:border-danger aria-invalid:focus-visible:shadow-[0_0_0_3px_color-mix(in_srgb,var(--danger)_20%,transparent)] disabled:cursor-not-allowed disabled:bg-surface-subtle disabled:text-ink-faint motion-reduce:transition-none";

export const InputControl = forwardRef<
  HTMLInputElement,
  ComponentPropsWithRef<"input"> & {
    loading?: boolean;
    "data-placeholder"?: string;
  }
>(function InputControl({ className, loading = false, ...props }, ref) {
  return (
    <input
      ref={ref}
      className={cn(
        formControlClass,
        loading && loadingPlaceholder(true, "control"),
        className,
      )}
      data-loading={loading || undefined}
      data-placeholder={loading ? "control" : props["data-placeholder"]}
      {...props}
    />
  );
});

export const TextareaControl = forwardRef<
  HTMLTextAreaElement,
  ComponentPropsWithRef<"textarea"> & {
    loading?: boolean;
    "data-placeholder"?: string;
  }
>(function TextareaControl({ className, loading = false, ...props }, ref) {
  return (
    <textarea
      ref={ref}
      className={cn(
        formControlClass,
        "h-auto! min-h-[92px]! resize-y rounded-[var(--radius-control)] py-2.5",
        loading && loadingPlaceholder(true, "control"),
        className,
      )}
      data-loading={loading || undefined}
      data-placeholder={loading ? "control" : props["data-placeholder"]}
      {...props}
    />
  );
});

export const FileInputControl = forwardRef<
  HTMLInputElement,
  Omit<ComponentPropsWithRef<"input">, "type"> & { loading?: boolean }
>(function FileInputControl({ className, loading = false, ...props }, ref) {
  return (
    <InputControl
      ref={ref}
      className={cn("hidden", className)}
      loading={loading}
      type="file"
      {...props}
    />
  );
});
