import { ExternalLink } from "lucide-react";
import Link from "next/link";
import type { ResearchItem } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { FramedRow } from "@/components/ui/public-shell";
import { cn } from "@/lib/cn";
import { loadingPlaceholder } from "@/lib/loading-style";

export function ResearchCard({
  item,
  loading = false,
  variant = "card",
  frame = false,
}: {
  item?: ResearchItem;
  loading?: boolean;
  variant?: "card" | "index";
  frame?: boolean;
}) {
  const meta =
    item?.paper?.venue ??
    item?.dataset?.license ??
    item?.project?.status?.replaceAll("_", " ") ??
    (loading ? "Loading metadata" : undefined);
  const typeLabel =
    item?.type?.toLowerCase() ?? (loading ? "loading" : "research");
  const title =
    item?.title ??
    item?.paper?.citation ??
    (loading ? "Research title is loading" : "Untitled research item");
  const summary =
    item?.summary ?? (loading ? "Research summary is loading" : undefined);
  const href =
    item?.type === "PROJECT" && item.project?.publicPageEnabled !== false
      ? `/projects/${item.slug}`
      : (item?.canonicalUrl ?? item?.legacyUrl ?? undefined);
  const external = item?.type !== "PROJECT";
  const index = variant === "index";

  return (
    <FramedRow
      as="article"
      aria-busy={loading || undefined}
      bleed={index && frame}
      className={cn(
        index
          ? "grid min-h-0 grid-cols-[95px_minmax(0,1fr)_150px] gap-[.4rem] bg-transparent px-[.2rem] py-4 max-[640px]:grid-cols-[70px_minmax(0,1fr)]"
          : "flex min-h-[250px] flex-col",
        index && frame && "px-[var(--public-gutter)]",
      )}
      data-loading={loading || undefined}
      rule={index}
    >
      <div className={index ? "self-start justify-self-start" : undefined}>
        <Badge loading={loading}>{typeLabel}</Badge>
      </div>
      <h3
        className={cn(
          "m-0 font-sans text-base font-medium tracking-[-.01em]",
          index && "col-start-2 row-start-1 m-0 text-[1.12rem] font-medium",
          loading && loadingPlaceholder(true, "text", "long"),
        )}
        data-placeholder={loading ? "text" : undefined}
        data-placeholder-width="long"
      >
        {title}
      </h3>
      {summary ? (
        <p
          className={cn(
            index &&
              "col-start-2 mt-[.15rem] mb-0 text-[.72rem] leading-[1.55] text-ink-muted",
            loading && loadingPlaceholder(true, "text"),
          )}
          data-placeholder={loading ? "text" : undefined}
        >
          {summary}
        </p>
      ) : null}
      {meta ? (
        <span
          className={cn(
            index
              ? "col-start-3 row-start-1 text-right font-mono text-[.56rem] text-ink-muted max-[640px]:col-start-2 max-[640px]:row-auto max-[640px]:text-left"
              : "text-[.82rem] text-ink-muted",
            loading && loadingPlaceholder(true, "text", "short"),
          )}
          data-placeholder={loading ? "text" : undefined}
          data-placeholder-width="short"
        >
          {meta}
        </span>
      ) : null}
      {loading ? (
        <span
          aria-hidden="true"
          className={cn(
            "h-[.7rem] w-20 bg-surface-subtle",
            index
              ? "col-start-3 row-start-2 self-end justify-self-end max-[640px]:col-start-2 max-[640px]:row-auto max-[640px]:justify-self-start"
              : "mt-auto",
          )}
        />
      ) : href && item?.type === "PROJECT" ? (
        <Link
          className={cn(
            "inline-flex items-center gap-[.4rem] font-bold text-brand",
            index
              ? "col-start-3 row-start-2 self-end justify-self-end text-[.66rem] max-[640px]:col-start-2 max-[640px]:row-auto max-[640px]:justify-self-start"
              : "mt-auto pt-6 text-[.88rem]",
          )}
          href={href}
        >
          View progress <ExternalLink aria-hidden="true" size={15} />
        </Link>
      ) : href ? (
        <a
          className={cn(
            "inline-flex items-center gap-[.4rem] font-bold text-brand",
            index
              ? "col-start-3 row-start-2 self-end justify-self-end text-[.66rem] max-[640px]:col-start-2 max-[640px]:row-auto max-[640px]:justify-self-start"
              : "mt-auto pt-6 text-[.88rem]",
          )}
          href={href}
          rel="noreferrer"
          target={external ? "_blank" : undefined}
        >
          Open source <ExternalLink aria-hidden="true" size={15} />
        </a>
      ) : null}
    </FramedRow>
  );
}
