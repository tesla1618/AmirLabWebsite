import { cn } from "@/lib/cn";
import { loadingPlaceholder } from "@/lib/loading-style";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { WorkspaceRuleBand } from "@/components/ui/workspace-surface";

interface WorkspaceRecordProps {
  actions?: ReactNode;
  backHref: string;
  backLabel: string;
  children: ReactNode;
  description?: string;
  eyebrow: string;
  loading?: boolean;
  title: string;
}

export function WorkspaceRecordForm({
  children,
  className,
  ...props
}: ComponentPropsWithoutRef<"form">) {
  return (
    <form
      className="relative border border-line-strong bg-surface"
      {...props}
    >
      <div
        className={cn(
          "mx-auto grid w-full max-w-[820px] gap-[1.35rem] px-[var(--workspace-gutter)] py-[clamp(1.25rem,3vw,2rem)] max-[640px]:px-4",
          className,
        )}
      >
        {children}
      </div>
    </form>
  );
}

export function WorkspaceRecordPanel({
  children,
  className,
  ...props
}: ComponentPropsWithoutRef<"section">) {
  return (
    <section
      className={cn(
        "relative border border-line-strong bg-surface",
        className,
      )}
      {...props}
    >
      <div className="mx-auto grid w-full max-w-[820px] gap-[1.35rem] px-[var(--workspace-gutter)] py-[clamp(1.25rem,3vw,2rem)] max-[640px]:px-4">
        {children}
      </div>
    </section>
  );
}

export function WorkspaceRecordPanelHeader({
  className,
  ...props
}: ComponentPropsWithoutRef<"header">) {
  return (
    <header
      className={cn(
        "grid gap-[.35rem] border-b border-line pb-[1.15rem]",
        className,
      )}
      {...props}
    />
  );
}

export function WorkspaceRecordPanelTitle({
  className,
  ...props
}: ComponentPropsWithoutRef<"h2">) {
  return (
    <h2
      className={cn(
        "m-0 font-sans text-[clamp(1.2rem,2vw,1.55rem)] font-medium leading-[1.15]",
        className,
      )}
      {...props}
    />
  );
}

export function WorkspaceRecord({
  actions,
  backHref,
  backLabel,
  children,
  description,
  eyebrow,
  loading = false,
  title,
}: WorkspaceRecordProps) {
  return (
    <div
      className="grid w-full gap-6 pb-20"
      data-loading={loading || undefined}
    >
      <Link
        className="inline-flex w-fit items-center gap-[.35rem] text-[.72rem] font-medium text-ink-muted hover:text-brand"
        href={backHref}
      >
        <ArrowLeft aria-hidden="true" size={15} /> {backLabel}
      </Link>
      <WorkspaceRuleBand contentClassName="flex items-end justify-between gap-4 py-5 max-[700px]:flex-col max-[700px]:items-stretch">
        <div>
          <p className="m-0 mb-2 font-mono text-[.58rem] font-semibold uppercase tracking-[.11em] text-brand">
            {eyebrow}
          </p>
          <h1
            className={cn(
              "mt-[.2rem] font-serif text-[clamp(1.7rem,3vw,2.35rem)] font-medium leading-[1.02] tracking-[-.03em]",
              loadingPlaceholder(loading, "text", "long"),
            )}
            data-placeholder={loading ? "text" : undefined}
            data-placeholder-width="long"
          >
            {title}
          </h1>
          {description ? (
            <p className="mt-[.55rem] max-w-[640px] text-[.76rem] leading-[1.55] text-ink-muted">
              {description}
            </p>
          ) : null}
        </div>
        {actions ? (
          <div className="flex flex-wrap justify-end gap-[.65rem] max-[700px]:justify-start">
            {actions}
          </div>
        ) : null}
      </WorkspaceRuleBand>
      {children}
    </div>
  );
}
