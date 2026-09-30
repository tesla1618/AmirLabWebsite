"use client";

import { ArrowDown, ArrowUp, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { InputControl } from "@/components/ui/form-controls";
import {
  PublicShell,
  publicShellWidthClass,
} from "@/components/ui/public-shell";
import { cn } from "@/lib/cn";
import { loadingPlaceholder } from "@/lib/loading-style";
import type {
  ProfileContentBlock,
  ProfileRecordView,
} from "@/lib/profile-content";

const ENTRY_PREVIEW_LIMIT = 6;
const LOADING_RECORDS: ProfileRecordView[] = [
  {
    id: "loading-education",
    title: "Loading profile section",
    type: "LOADING",
    entryCount: 3,
    blocks: [
      {
        heading: null,
        entries: [
          { label: null, content: "Loading entry" },
          { label: null, content: "Loading entry" },
          { label: null, content: "Loading entry" },
        ],
      },
    ],
  },
  {
    id: "loading-activity",
    title: "Loading profile section",
    type: "LOADING",
    entryCount: 3,
    blocks: [
      {
        heading: null,
        entries: [
          { label: null, content: "Loading entry" },
          { label: null, content: "Loading entry" },
          { label: null, content: "Loading entry" },
        ],
      },
    ],
  },
];

export function ProfileRecords({
  records = [],
  loading = false,
}: {
  records?: ProfileRecordView[];
  loading?: boolean;
}) {
  const visible = loading ? LOADING_RECORDS : records;
  return (
    <div
      aria-busy={loading || undefined}
      aria-hidden={loading || undefined}
      data-loading={loading || undefined}
    >
      <nav
        aria-label="Profile sections"
        className={cn(
          publicShellWidthClass,
          "sticky top-[62px] z-20 flex overflow-x-auto border-b border-line-strong bg-canvas [scrollbar-width:none]",
        )}
      >
        {visible.map((record) => (
          <a
            aria-disabled={loading || undefined}
            className="grid min-h-[60px] flex-[1_0_190px] grid-cols-[minmax(0,1fr)_auto] items-center gap-[.5rem] px-4 py-[.8rem] transition-colors hover:text-brand"
            href={loading ? undefined : `#profile-section-${record.id}`}
            key={record.id}
            tabIndex={loading ? -1 : undefined}
          >
            <strong
              className={cn(
                "font-sans text-[.8rem] font-medium",
                loading && loadingPlaceholder(true, "text"),
              )}
              data-placeholder={loading ? "text" : undefined}
            >
              {record.title}
            </strong>
            <small
              className={cn(
                "font-mono text-[.62rem] text-ink-muted",
                loading && loadingPlaceholder(true, "value"),
              )}
              data-placeholder={loading ? "value" : undefined}
            >
              {loading ? "00" : record.entryCount}
            </small>
          </a>
        ))}
      </nav>
      <PublicShell
        as="div"
        aria-hidden={loading || undefined}
        className="grid pb-32"
      >
        {visible.map((record) => (
          <ProfileRecord key={record.id} loading={loading} record={record} />
        ))}
      </PublicShell>
    </div>
  );
}

function ProfileRecord({
  record,
  loading = false,
}: {
  record: ProfileRecordView;
  loading?: boolean;
}) {
  const [query, setQuery] = useState("");
  const searchable = !loading && record.entryCount > 12;
  const normalizedQuery = query.trim().toLowerCase();
  const blocks = useMemo(
    () =>
      normalizedQuery
        ? record.blocks.flatMap((block) => {
            const entries = block.entries.filter((entry) =>
              `${entry.label ?? ""} ${entry.content}`
                .toLowerCase()
                .includes(normalizedQuery),
            );
            return entries.length ? [{ ...block, entries }] : [];
          })
        : record.blocks,
    [normalizedQuery, record.blocks],
  );

  return (
    <section
      className="relative mx-[calc(var(--public-gutter)*-1)] grid scroll-mt-[130px] grid-cols-[minmax(230px,.38fr)_minmax(0,1fr)] gap-[clamp(2rem,6vw,6rem)] border-b border-line-strong px-[var(--public-gutter)] py-16 max-[960px]:grid-cols-1 max-[960px]:gap-8 max-[640px]:py-14 last:border-b-0"
      id={loading ? undefined : `profile-section-${record.id}`}
    >
      <header className="sticky top-[150px] self-start max-[960px]:static">
        <div>
          <p
            aria-hidden={loading || undefined}
            className={cn(
              "mb-[.6rem] font-mono text-[.68rem] tracking-[.07em] text-brand uppercase",
              loading && loadingPlaceholder(true, "text", "short"),
            )}
            data-placeholder={loading ? "text" : undefined}
          >
            {loading ? "Loading" : record.type}
          </p>
          <h2
            className={cn(
              "m-0 font-sans text-[clamp(1.55rem,2.5vw,2.15rem)] font-medium tracking-[-.035em]",
              loading && loadingPlaceholder(true, "text"),
            )}
            data-placeholder={loading ? "text" : undefined}
          >
            {record.title}
          </h2>
          <small
            className={cn(
              "mt-[.7rem] block font-mono text-[.64rem] text-ink-muted",
              loading && loadingPlaceholder(true, "text"),
            )}
            data-placeholder={loading ? "text" : undefined}
          >
            {loading
              ? "00 entries"
              : `${record.entryCount} ${record.entryCount === 1 ? "entry" : "entries"}`}
          </small>
        </div>
      </header>
      <div className="grid min-w-0 gap-8">
        {searchable ? (
          <label className="grid grid-cols-[18px_minmax(0,1fr)] items-center gap-2 border-b border-line pb-3 text-ink-muted">
            <Search aria-hidden="true" size={17} />
            <span className="sr-only">Search {record.title}</span>
            <InputControl
              className="border-0 bg-transparent p-0 shadow-none! focus-visible:border-0 focus-visible:shadow-none!"
              onChange={(event) => setQuery(event.target.value)}
              placeholder={`Search ${record.title.toLowerCase()}`}
              type="search"
              value={query}
            />
          </label>
        ) : null}
        <div className="grid min-w-0 gap-12">
          {blocks.length ? (
            (() => {
              return blocks.map((block, blockIndex) => (
                <ProfileBlock
                  block={block}
                  blockKey={`${record.id}-${blockIndex}`}
                  key={`${record.id}-${blockIndex}`}
                  loading={loading}
                  searching={Boolean(normalizedQuery)}
                />
              ));
            })()
          ) : (
            <p className="m-0 py-8 text-ink-muted">
              No entries match “{query}”.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

function ProfileBlock({
  block,
  blockKey,
  searching,
  loading = false,
}: {
  block: ProfileContentBlock;
  blockKey: string;
  searching: boolean;
  loading?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const hasMore =
    !loading && !searching && block.entries.length > ENTRY_PREVIEW_LIMIT;
  const entries =
    hasMore && !expanded
      ? block.entries.slice(0, ENTRY_PREVIEW_LIMIT)
      : block.entries;

  return (
    <section>
      {block.heading ? (
        <header className="flex items-baseline justify-between">
          <h3
            className={cn(
              "mt-0 mb-5 font-sans text-[1.2rem] font-medium tracking-[-.025em]",
              loading && loadingPlaceholder(true, "text"),
            )}
            data-placeholder={loading ? "text" : undefined}
          >
            {block.heading}
          </h3>
          <span className="font-mono text-[.65rem] text-ink-muted">
            {block.entries.length}
          </span>
        </header>
      ) : null}
      <div className="border-t border-line">
        {entries.map((entry, entryIndex) => (
          <article
            className="border-b border-line py-[1.15rem]"
            key={`${blockKey}-${entryIndex}`}
          >
            <div className="grid min-w-0 gap-[.35rem]">
              {entry.label ? (
                <p
                  className={cn(
                    "m-0 font-mono text-[.66rem] font-semibold uppercase tracking-[.06em] text-ink",
                    loading && loadingPlaceholder(true, "text"),
                  )}
                  data-placeholder={loading ? "text" : undefined}
                >
                  {entry.label}
                </p>
              ) : null}
              {entry.content.split("\n").map((line, lineIndex) => (
                <p
                  className={cn(
                    "m-0 whitespace-pre-wrap break-words text-[.82rem] leading-[1.62] text-ink-muted",
                    !entry.label && lineIndex === 0 && "text-[.94rem] text-ink",
                    loading && loadingPlaceholder(true, "text"),
                  )}
                  data-placeholder={loading ? "text" : undefined}
                  key={lineIndex}
                >
                  {line}
                </p>
              ))}
            </div>
          </article>
        ))}
      </div>
      {hasMore ? (
        <button
          aria-expanded={expanded}
          className="mt-[.9rem] inline-flex cursor-pointer items-center gap-[.4rem] border-0 bg-transparent p-0 text-[.75rem] font-bold text-brand hover:text-brand-hover"
          onClick={() => setExpanded((value) => !value)}
          type="button"
        >
          {expanded ? "Show fewer" : `Show all ${block.entries.length}`}
          {expanded ? (
            <ArrowUp aria-hidden="true" size={15} />
          ) : (
            <ArrowDown aria-hidden="true" size={15} />
          )}
        </button>
      ) : null}
    </section>
  );
}
