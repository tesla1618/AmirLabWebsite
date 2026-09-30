import { forwardRef } from "react";
import type { ComponentPropsWithRef } from "react";
import { cn } from "@/lib/cn";
import { loadingPlaceholder } from "@/lib/loading-style";

type IconButtonVariant = "bare" | "bordered";
type IconButtonSize = "sm" | "md";
type IconButtonShape = "control" | "round";

const sizeClass: Record<IconButtonSize, string> = {
  sm: "h-[27px] w-[27px]",
  md: "h-8 w-8",
};

export const IconButton = forwardRef<
  HTMLButtonElement,
  ComponentPropsWithRef<"button"> & {
    loading?: boolean;
    shape?: IconButtonShape;
    size?: IconButtonSize;
    variant?: IconButtonVariant;
  }
>(function IconButton(
  {
    className,
    disabled,
    loading = false,
    shape = "control",
    size = "md",
    type = "button",
    variant = "bare",
    ...props
  },
  ref,
) {
  return (
    <button
      ref={ref}
      className={cn(
        "inline-flex shrink-0 cursor-pointer items-center justify-center p-0 text-ink-muted transition-[background,color,box-shadow] duration-[140ms] hover:text-brand focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)] disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none",
        sizeClass[size],
        shape === "round" ? "rounded-full" : "rounded-control",
        variant === "bordered"
          ? "border border-line bg-surface"
          : "border-0 bg-transparent",
        loading && loadingPlaceholder(true, "control"),
        className,
      )}
      data-placeholder={loading ? "control" : undefined}
      disabled={disabled || loading}
      type={type}
      {...props}
    />
  );
});
