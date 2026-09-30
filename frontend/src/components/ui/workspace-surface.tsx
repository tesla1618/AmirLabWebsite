import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { cn } from "@/lib/cn";
import { loadingPlaceholder } from "@/lib/loading-style";

// Form pages use a narrower content box. Each measure is a complete class so
// no two max-width utilities are ever combined (`cn` does not merge them).
const formShellClass =
  "mx-auto w-full max-w-[min(var(--workspace-form),calc(100%_-_2*var(--frame-mobile-inner)))] px-[var(--workspace-gutter)]";

/**
 * The workspace content box. Its edges are the workspace rails at every width
 * (see --frame-inner with --frame-wide: var(--workspace-wide)).
 */
export const workspaceShellClass =
  "mx-auto w-full max-w-[min(var(--workspace-wide),calc(100%_-_2*var(--frame-mobile-inner)))] px-[var(--workspace-gutter)]";

export function WorkspaceSurface({
  children,
  measure = "reading",
}: {
  children: ReactNode;
  measure?: "form" | "reading" | "wide";
}) {
  return (
    <main
      className={cn(
        measure === "form" ? formShellClass : workspaceShellClass,
        "relative grid min-h-[calc(100svh-64px)] gap-[1.5rem] pt-[1.75rem] pb-12 max-[820px]:min-h-0 max-[640px]:gap-[.9rem] max-[640px]:pt-4 max-[640px]:pb-10",
      )}
    >
      {children}
    </main>
  );
}

export function WorkspaceHero({
  action,
  description,
  eyebrow,
  meta,
  title,
}: {
  action?: ReactNode;
  description?: ReactNode;
  eyebrow: ReactNode;
  meta?: ReactNode;
  title: ReactNode;
}) {
  return (
    <header className="relative mx-[calc(var(--workspace-gutter)*-1)] grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-end gap-5 border-b border-line-strong px-[var(--workspace-gutter)] pt-[.4rem] pb-[1.15rem] max-[640px]:grid-cols-1 max-[640px]:items-start">
      <div className="min-w-0">
        <p className="mb-[.42rem] font-mono text-[.61rem] font-semibold tracking-[.11em] text-brand uppercase">
          {eyebrow}
        </p>
        <h1 className="m-0 font-serif text-[clamp(1.85rem,2.7vw,2.35rem)] leading-[1.02] font-medium tracking-[-.035em] max-[640px]:text-[clamp(1.8rem,9vw,2.25rem)]">
          {title}
        </h1>
        {description ? (
          <p className="mt-[.65rem] mb-0 max-w-[700px] text-[.76rem] leading-[1.55] text-ink-muted">
            {description}
          </p>
        ) : null}
        {meta ? (
          <div className="mt-[.7rem] flex flex-wrap gap-x-[1.2rem] gap-y-[.35rem] font-mono text-[.59rem] text-ink-muted uppercase">
            {meta}
          </div>
        ) : null}
      </div>
      {action ? (
        <div className="flex shrink-0 items-center max-[640px]:w-full max-[640px]:[&>*]:w-full">
          {action}
        </div>
      ) : null}
    </header>
  );
}

export function WorkspacePanel({
  action,
  children,
  description,
  eyebrow,
  title,
}: {
  action?: ReactNode;
  children: ReactNode;
  description?: ReactNode;
  eyebrow?: ReactNode;
  title: ReactNode;
}) {
  return (
    <section className="relative min-w-0 border border-line-strong bg-surface">
      <header className="flex items-start justify-between gap-[1.2rem] border-b border-line px-4 py-[.9rem] max-[640px]:flex-col max-[640px]:p-[.8rem]">
        <div>
          {eyebrow ? (
            <p className="mb-[.42rem] font-mono text-[.61rem] font-semibold tracking-[.11em] text-brand uppercase">
              {eyebrow}
            </p>
          ) : null}
          <h2 className="m-0 font-serif text-[1.2rem] leading-[1.1] font-medium tracking-[-.018em]">
            {title}
          </h2>
          {description ? (
            <p className="mt-[.3rem] mb-0 max-w-[640px] text-[.7rem] leading-[1.45] text-ink-muted">
              {description}
            </p>
          ) : null}
        </div>
        {action ? <div>{action}</div> : null}
      </header>
      {children}
    </section>
  );
}

export function WorkspaceMetricStrip({ children }: { children: ReactNode }) {
  return (
    <section className="relative grid grid-cols-4 border border-line-strong bg-surface max-[900px]:grid-cols-2">
      {children}
    </section>
  );
}

export function WorkspaceMetric({
  detail,
  label,
  loading = false,
  tone = "neutral",
  value,
}: {
  detail: ReactNode;
  label: ReactNode;
  loading?: boolean;
  tone?: "attention" | "brand" | "neutral" | "success";
  value: ReactNode;
}) {
  const toneTop =
    tone === "brand"
      ? "before:bg-brand"
      : tone === "attention"
        ? "before:bg-danger"
        : tone === "success"
          ? "before:bg-success"
          : "before:bg-line";
  return (
    <article
      className={cn(
        "relative grid min-w-0 gap-1 border-l border-line px-4 pt-[.8rem] pb-[.9rem] first:border-l-0 before:absolute before:inset-x-0 before:top-0 before:h-0.5 before:content-[''] max-[900px]:nth-3:border-l-0 max-[900px]:nth-3:border-t max-[900px]:nth-4:border-t max-[640px]:px-[.8rem] max-[640px]:py-[.7rem]",
        toneTop,
      )}
      data-loading={loading || undefined}
    >
      <span className="overflow-hidden text-ellipsis whitespace-nowrap font-mono text-[.55rem] tracking-[.08em] text-ink-muted uppercase">
        {label}
      </span>
      <strong
        className={cn(
          "font-mono text-[1.35rem] leading-[1.05] font-medium",
          loading && loadingPlaceholder(true, "value", "short"),
        )}
        data-placeholder={loading ? "value" : undefined}
        data-placeholder-width="short"
      >
        {value}
      </strong>
      <small className="text-[.64rem] leading-[1.35] text-ink-muted">
        {detail}
      </small>
    </article>
  );
}

export function WorkspaceSplit({ children }: { children: ReactNode }) {
  return (
    <div className="grid grid-cols-[minmax(0,1.22fr)_minmax(320px,.78fr)] items-start gap-[1.15rem] max-[900px]:grid-cols-1">
      {children}
    </div>
  );
}

export function WorkspaceEmpty({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-[110px] place-content-center justify-items-start p-4 text-[.74rem] leading-[1.5] text-ink-muted">
      {children}
    </div>
  );
}

/**
 * An inset workspace panel aligned inside the persistent page rails. Internal
 * dividers belong to the child content; the panel owns the outer rectangle.
 */
export function WorkspaceRuleBand({
  children,
  className,
  contentClassName,
  ...props
}: ComponentPropsWithoutRef<"section"> & {
  contentClassName?: string;
}) {
  return (
    <section
      className={cn(
        "relative min-w-0 border border-line-strong bg-surface",
        className,
      )}
      {...props}
    >
      <div
        className={cn("min-w-0 px-[var(--workspace-gutter)]", contentClassName)}
      >
        {children}
      </div>
    </section>
  );
}

export function WorkspaceCollection({
  children,
  className,
  ...props
}: ComponentPropsWithoutRef<"div">) {
  return (
    <WorkspaceRuleBand
      className={className}
      contentClassName="grid !px-0"
      {...props}
    >
      {children}
    </WorkspaceRuleBand>
  );
}

export function WorkspaceRow({
  children,
  className,
  ...props
}: ComponentPropsWithoutRef<"div">) {
  return (
    <div className="relative border-b border-line last:border-b-0" {...props}>
      <div className="min-w-0 px-[var(--workspace-gutter)]">
        <div className={cn("min-w-0", className)}>{children}</div>
      </div>
    </div>
  );
}

// Both panes stay in view on desktop and scroll internally (RULES §7).
const reviewPane =
  "sticky top-[88px] max-h-[calc(100svh-104px)] min-w-0 overflow-y-auto max-[960px]:static max-[960px]:max-h-none max-[960px]:overflow-visible";

/**
 * The master/detail card shared by every review queue: the queue pane on the
 * left, the open record on the right. The detail pane is a size container so
 * record layouts adapt to the pane, not the viewport.
 */
export function ReviewSplit({
  detail,
  detailLoading = false,
  dimQueue = false,
  queue,
}: {
  detail: ReactNode;
  detailLoading?: boolean;
  dimQueue?: boolean;
  queue: ReactNode;
}) {
  return (
    <WorkspaceRuleBand contentClassName="grid min-w-0 grid-cols-[minmax(300px,392px)_minmax(0,1fr)] items-start !px-0 max-[960px]:grid-cols-1">
      <aside
        className={cn(
          reviewPane,
          "grid content-start border-r border-line max-[960px]:border-r-0 max-[960px]:border-b",
          dimQueue && "opacity-70",
        )}
      >
        {queue}
      </aside>
      <section
        className={cn(
          reviewPane,
          "@container grid content-start gap-4 p-5 max-[960px]:px-[var(--workspace-gutter)]",
        )}
        data-loading={detailLoading || undefined}
      >
        {detail}
      </section>
    </WorkspaceRuleBand>
  );
}
