import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { forwardRef } from "react";
import type { ComponentProps, ComponentPropsWithRef, ReactNode } from "react";
import { cn } from "@/lib/cn";
import { loadingPlaceholder } from "@/lib/loading-style";

export type ActionVariant =
  | "add-another"
  | "add-empty"
  | "danger"
  | "danger-ghost"
  | "dark"
  | "dark-outline"
  | "dashed"
  | "dotted"
  | "ghost"
  | "primary"
  | "secondary";

const variantClass: Record<ActionVariant, string> = {
  primary:
    "border-brand bg-brand text-on-accent hover:border-brand-hover hover:bg-brand-hover",
  secondary:
    "border-line-strong bg-surface text-ink hover:border-line-strong hover:bg-surface-subtle",
  ghost:
    "border-transparent bg-transparent text-ink hover:bg-surface-subtle hover:text-ink",
  dashed:
    "border-line-strong bg-surface text-ink hover:border-line-strong hover:bg-surface-subtle",
  dotted:
    "border-line-strong bg-surface text-ink hover:border-line-strong hover:bg-surface-subtle",
  danger:
    "border-danger/50 bg-danger-soft text-danger hover:border-danger hover:bg-danger-soft",
  "danger-ghost":
    "border-transparent bg-transparent text-danger hover:bg-danger-soft hover:text-danger-hover",
  dark: "border-dark-line bg-transparent text-dark-ink hover:border-dark-ink hover:bg-dark-ink hover:text-dark-surface",
  "dark-outline":
    "border-dark-line bg-transparent text-dark-ink hover:border-dark-ink",
  "add-empty":
    "border-line-strong bg-surface text-brand hover:border-brand hover:bg-brand-soft",
  "add-another":
    "border-transparent bg-brand-soft text-brand hover:bg-[color-mix(in_srgb,var(--brand)_16%,var(--surface))]",
};

function actionClassName({
  className,
  compact,
  loading,
  variant,
}: {
  className?: string;
  compact?: boolean;
  loading?: boolean;
  variant: ActionVariant;
}) {
  return cn(
    "inline-flex h-[var(--control-height)] min-h-[var(--control-height)] cursor-pointer items-center justify-center gap-2 rounded-[var(--radius-control)] border px-3.5 py-0 text-xs font-medium transition-[border-color,background,color,box-shadow] duration-[140ms] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)] disabled:cursor-not-allowed disabled:opacity-55 motion-reduce:transition-none",
    variantClass[variant],
    compact && "h-8 min-h-8 px-[.65rem] text-[.7rem]",
    loading && loadingPlaceholder(true, "control"),
    className,
  );
}

function ExternalMarker() {
  return <ExternalLink aria-hidden="true" className="shrink-0" size={14} />;
}

export const ButtonControl = forwardRef<
  HTMLButtonElement,
  ComponentPropsWithRef<"button"> & {
    compact?: boolean;
    externalIcon?: boolean;
    loading?: boolean;
    variant?: ActionVariant;
  }
>(function ButtonControl(
  {
    children,
    className,
    compact,
    disabled,
    externalIcon = false,
    loading = false,
    type = "button",
    variant = "secondary",
    ...props
  },
  ref,
) {
  return (
    <button
      ref={ref}
      className={actionClassName({ className, compact, loading, variant })}
      aria-busy={loading || undefined}
      data-loading={loading || undefined}
      data-placeholder={loading ? "control" : undefined}
      disabled={disabled || loading}
      type={type}
      {...props}
    >
      {children}
      {externalIcon ? <ExternalMarker /> : null}
    </button>
  );
});

export function ButtonLink({
  children,
  className,
  compact,
  externalIcon = false,
  loading = false,
  tabIndex,
  variant = "secondary",
  ...props
}: Omit<ComponentProps<typeof Link>, "className"> & {
  children: ReactNode;
  className?: string;
  compact?: boolean;
  externalIcon?: boolean;
  loading?: boolean;
  variant?: ActionVariant;
}) {
  return (
    <Link
      className={actionClassName({
        className: cn(loading && "pointer-events-none", className),
        compact,
        loading,
        variant,
      })}
      {...props}
      aria-busy={loading || undefined}
      aria-disabled={loading || props["aria-disabled"] || undefined}
      data-loading={loading || undefined}
      data-placeholder={loading ? "control" : undefined}
      tabIndex={loading ? -1 : tabIndex}
    >
      {children}
      {externalIcon ? <ExternalMarker /> : null}
    </Link>
  );
}

export const ButtonAnchor = forwardRef<
  HTMLAnchorElement,
  ComponentPropsWithRef<"a"> & {
    compact?: boolean;
    externalIcon?: boolean;
    loading?: boolean;
    variant?: ActionVariant;
  }
>(function ButtonAnchor(
  {
    children,
    className,
    compact,
    externalIcon,
    loading = false,
    tabIndex,
    variant = "secondary",
    ...props
  },
  ref,
) {
  const showExternalIcon = externalIcon ?? props.target === "_blank";
  return (
    <a
      ref={ref}
      className={actionClassName({
        className: cn(loading && "pointer-events-none", className),
        compact,
        loading,
        variant,
      })}
      {...props}
      aria-busy={loading || undefined}
      aria-disabled={loading || props["aria-disabled"] || undefined}
      data-loading={loading || undefined}
      data-placeholder={loading ? "control" : undefined}
      tabIndex={loading ? -1 : tabIndex}
    >
      {children}
      {showExternalIcon ? <ExternalMarker /> : null}
    </a>
  );
});
