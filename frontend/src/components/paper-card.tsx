"use client";

import { useState } from "react";
import { ArrowUpRight } from "lucide-react";
import type { ResearchItem } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { FramedRow } from "@/components/ui/public-shell";
import { cn } from "@/lib/cn";
import { loadingPlaceholder } from "@/lib/loading-style";

export function PaperCard({
  frame = false,
  item,
  loading = false,
}: {
  frame?: boolean;
  item?: ResearchItem;
  loading?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const source = item?.canonicalUrl ?? item?.legacyUrl;
  const title =
    item?.title ??
    item?.paper?.citation ??
    (loading ? "Publication title is loading" : "Untitled paper");
  const linkedAuthors = (item?.contributors ?? [])
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map(({ displayName }) => displayName)
    .join(", ");
  const authors =
    linkedAuthors ||
    authorsFromCitation(item?.paper?.citation, title) ||
    (loading ? "Authors and affiliations" : "");
  const details = item?.summary ?? item?.paper?.citation;
  const category = item?.paper?.publicationType
    ?.toLowerCase()
    .replaceAll("_", " ");
  const doi = normalizeDoi(item?.paper?.doi);
  return (
    <FramedRow
      as="article"
      aria-busy={loading || undefined}
      bleed={frame}
      className={cn("bg-transparent")}
      data-loading={loading || undefined}
    >
      <button
        aria-expanded={!loading && open}
        className={cn(
          "group block w-full cursor-pointer border-0 bg-transparent px-1 py-3 text-left text-inherit hover:bg-transparent focus-visible:bg-surface-subtle disabled:cursor-default disabled:hover:bg-transparent",
          frame && "px-[var(--public-gutter)]",
        )}
        disabled={loading || !details}
        onClick={() => setOpen((current) => !current)}
        type="button"
      >
        <span className="grid gap-[.36rem]">
          <span className="flex flex-wrap items-center gap-[7px]">
            <Badge loading={loading}>
              {item?.paper?.year ?? (loading ? "0000" : "Undated")}
            </Badge>
            {loading || category ? (
              <Badge loading={loading}>{category ?? "publication"}</Badge>
            ) : null}
            {!loading && item?.paper?.venue ? (
              <Badge>{item.paper.venue}</Badge>
            ) : null}
          </span>
          <strong
            className={cn(
              "font-sans text-base leading-[1.35] font-medium tracking-[-.01em] transition-colors duration-[140ms] group-hover:text-brand",
              loading && loadingPlaceholder(true, "text", "long"),
            )}
            data-placeholder={loading ? "text" : undefined}
            data-placeholder-width="long"
          >
            {title}
          </strong>
          {loading || authors ? (
            <span
              className={cn(
                "text-[.72rem] leading-[1.5] text-ink-muted",
                loading && loadingPlaceholder(true, "text", "medium"),
              )}
              data-placeholder={loading ? "text" : undefined}
              data-placeholder-width="medium"
            >
              {authors}
            </span>
          ) : null}
          {loading || details ? (
            <em
              className={cn(
                "text-[.63rem] font-normal text-ink-faint not-italic",
                loading && loadingPlaceholder(true, "text", "short"),
              )}
              data-placeholder={loading ? "text" : undefined}
              data-placeholder-width="short"
            >
              {loading
                ? "Loading details"
                : open
                  ? "Click to collapse details"
                  : "Click to expand details"}
            </em>
          ) : null}
        </span>
      </button>
      {!loading && open && details ? (
        <div className={cn("px-1 pb-3", frame && "px-[var(--public-gutter)]")}>
          <p className="m-0 max-w-[850px] text-[.76rem] leading-[1.65] text-ink-muted">
            {details}
          </p>
        </div>
      ) : null}
      <footer
        className={cn(
          "flex items-center justify-between gap-4 px-1 pb-3 max-[640px]:flex-col max-[640px]:items-start",
          frame && "px-[var(--public-gutter)]",
        )}
      >
        <span
          className={cn(
            "font-mono text-[.55rem] text-ink-muted [overflow-wrap:anywhere]",
            loading && loadingPlaceholder(true, "text", "medium"),
          )}
          data-placeholder={loading ? "text" : undefined}
          data-placeholder-width="medium"
        >
          {loading
            ? "doi.org/00.0000/example"
            : doi
              ? `doi.org/${doi}`
              : "DOI not available"}
        </span>
        {loading ? (
          <span
            aria-hidden="true"
            className="h-[.7rem] w-20 bg-surface-subtle"
          />
        ) : source ? (
          <a
            className="inline-flex items-center gap-[.3rem] text-[.66rem] font-semibold text-brand"
            href={source}
            rel="noreferrer"
            target="_blank"
          >
            Read paper <ArrowUpRight aria-hidden="true" size={14} />
          </a>
        ) : null}
      </footer>
    </FramedRow>
  );
}

function normalizeDoi(doi: string | null | undefined): string | null {
  const value = doi?.trim().replace(/^https?:\/\/(dx\.)?doi\.org\//i, "");
  return value || null;
}

function authorsFromCitation(
  citation: string | null | undefined,
  title: string,
): string {
  if (!citation) return "";
  const cleanTitle = title.replace(/[.,;:]$/, "");
  const index = citation
    .toLocaleLowerCase()
    .indexOf(cleanTitle.toLocaleLowerCase());
  if (index <= 0) return "";
  return citation
    .slice(0, index)
    .replace(/^\s*\d+[.)]\s*/, "")
    .replace(/\s*\(?\d{4}\)?\s*$/, "")
    .replace(/[\s,:;“”"'‘’—-]+$/, "")
    .trim();
}
