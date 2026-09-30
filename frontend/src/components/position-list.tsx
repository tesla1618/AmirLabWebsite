"use client";

import Link from "next/link";
import { ArrowRight, CalendarDays } from "lucide-react";
import { useState } from "react";
import { StatePanel } from "@/components/state-panel";
import { TabsControl } from "@/components/ui/tabs-control";
import {
  FramedCollection,
  FramedRow,
  PublicSection,
} from "@/components/ui/public-shell";
import { cn } from "@/lib/cn";
import { loadingPlaceholder } from "@/lib/loading-style";
import type { Position } from "@/lib/types";

export function PositionList({
  positions = [],
  loading = false,
}: {
  positions?: Position[];
  loading?: boolean;
}) {
  const [category, setCategory] = useState("ALL");
  const categories = new Map<string, number>();
  for (const position of positions) {
    const value = position.positionType ?? "OTHER";
    categories.set(value, (categories.get(value) ?? 0) + 1);
  }
  const tabs = [
    { count: positions.length, label: "All roles", value: "ALL" },
    ...[...categories.entries()].map(([value, count]) => ({
      count,
      label: rankLabel(value),
      value,
    })),
  ];
  const visible = loading
    ? Array.from({ length: 3 }, () => undefined)
    : positions.filter(
        (position) => category === "ALL" || position.positionType === category,
      );

  return (
    <PublicSection
      aria-busy={loading || undefined}
      aria-labelledby="current-opportunities"
      boundary="bottom"
      contentClassName="grid gap-4 pt-8 pb-14"
      data-loading={loading || undefined}
    >
      <div className="flex items-end justify-between max-[640px]:flex-col max-[640px]:items-start">
        <div>
          <p
            aria-hidden={loading || undefined}
            className={cn(
              "m-0 mb-4 font-[var(--font-sans)] text-[.75rem] font-extrabold uppercase tracking-[.12em] text-brand",
              loading && loadingPlaceholder(true, "label", "medium"),
            )}
          >
            Current opportunities
          </p>
          <h2
            aria-hidden={loading || undefined}
            className={cn(
              "mt-[.1rem] font-sans text-[1.9rem] font-medium tracking-[-.03em]",
              loading && loadingPlaceholder(true, "text", "medium"),
            )}
            id="current-opportunities"
          >
            Open roles
          </h2>
        </div>
        <span
          className={cn(
            "font-mono text-[.68rem] text-ink-muted",
            loadingPlaceholder(loading, "text", "short"),
          )}
          data-placeholder={loading ? "text" : undefined}
        >
          {loading ? "00 available" : `${positions.length} available`}
        </span>
      </div>
      {!loading && tabs.length > 2 ? (
        <TabsControl
          ariaLabel="Position categories"
          className="overflow-x-auto border-b border-line"
          onValueChange={setCategory}
          options={tabs}
          value={category}
        />
      ) : null}
      {visible.length ? (
        <FramedCollection className="grid">
          {visible.map((position, index) => (
            <FramedRow
              as="article"
              className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-[clamp(1rem,2vw,2rem)] px-[var(--public-gutter)] py-4 first:border-t max-[640px]:grid-cols-1"
              key={position?.id ?? `loading-position-${index}`}
            >
              <div className="grid gap-[.55rem]">
                <span
                  className={cn(
                    "font-mono text-[.62rem] uppercase tracking-[.05em] text-brand",
                    loadingPlaceholder(loading, "text", "short"),
                  )}
                  data-placeholder={loading ? "text" : undefined}
                >
                  {position
                    ? `${rankLabel(position.positionType ?? "OTHER")}${position.department ? ` · ${position.department.name}` : ""}`
                    : "Research opportunity"}
                </span>
                <h3
                  className={cn(
                    "font-serif text-[clamp(1.2rem,2.2vw,1.7rem)] font-medium",
                    loadingPlaceholder(loading, "text", "long"),
                  )}
                  data-placeholder={loading ? "text" : undefined}
                >
                  {position?.title ??
                    (loading ? "Position title is loading" : "")}
                </h3>
                {loading || position?.summary ? (
                  <p
                    className={cn(
                      "m-0 max-w-[760px] text-[.76rem] leading-[1.55] text-ink-muted",
                      loadingPlaceholder(loading, "text", "full"),
                    )}
                    data-placeholder={loading ? "text" : undefined}
                  >
                    {loading
                      ? "Position summary is loading"
                      : position?.summary}
                  </p>
                ) : null}
                <span
                  className={cn(
                    "inline-flex items-center gap-[.35rem] text-[.72rem] text-ink-muted",
                    loadingPlaceholder(loading, "text", "medium"),
                  )}
                  data-placeholder={loading ? "text" : undefined}
                >
                  <CalendarDays
                    aria-hidden="true"
                    className={loading ? "opacity-[.12]" : undefined}
                    data-loading-icon={loading || undefined}
                    size={14}
                  />
                  {position
                    ? position.closesAt
                      ? `Apply by ${new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" }).format(new Date(position.closesAt))}`
                      : "Rolling applications"
                    : "Application deadline"}
                </span>
              </div>
              {loading ? (
                <span
                  aria-hidden="true"
                  className="mt-[.2rem] h-[.75rem] w-16 bg-surface-subtle max-[640px]:justify-self-start"
                />
              ) : (
                <Link
                  className="inline-flex items-center gap-[.35rem] pt-[.2rem] text-[.78rem] font-bold text-brand max-[640px]:justify-self-start"
                  href="#apply"
                >
                  Apply <ArrowRight aria-hidden="true" size={16} />
                </Link>
              )}
            </FramedRow>
          ))}
        </FramedCollection>
      ) : (
        <StatePanel
          body="New roles will appear here when the lab begins accepting applications."
          frame
          title="No positions are open right now"
        />
      )}
    </PublicSection>
  );
}

function rankLabel(value: string): string {
  if (value === "GENERAL") return "Research opportunity";
  return value
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/^./, (letter) => letter.toUpperCase());
}
