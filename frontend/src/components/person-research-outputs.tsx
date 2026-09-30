"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { PaperCard } from "@/components/paper-card";
import { ResearchCard } from "@/components/research-card";
import { Eyebrow, FrameRule, PublicShell } from "@/components/ui/public-shell";
import { cn } from "@/lib/cn";
import { loadingPlaceholder } from "@/lib/loading-style";
import type { Person, ResearchItem, ResearchItemType } from "@/lib/types";

const LABELS: Record<ResearchItemType, string> = {
  PAPER: "Papers",
  DATASET: "Datasets",
  PROJECT: "Projects",
};
const PREVIEW_SIZE = 6;

export function PersonResearchOutputs({
  contributions = [],
  loading = false,
  borderBottom = false,
}: {
  contributions?: NonNullable<Person["contributions"]>;
  loading?: boolean;
  borderBottom?: boolean;
}) {
  const [expanded, setExpanded] = useState<
    Partial<Record<ResearchItemType, boolean>>
  >({});
  const groups = loading
    ? (["PAPER", "PROJECT"] as const).map((type) => ({
        items: Array.from(
          { length: 3 },
          () => undefined as ResearchItem | undefined,
        ),
        type,
      }))
    : (["PAPER", "DATASET", "PROJECT"] as const)
        .map((type) => ({
          items: contributions
            .map(({ researchItem }) => researchItem)
            .filter((item) => item.type === type),
          type,
        }))
        .filter(({ items }) => items.length);

  if (!groups.length) return null;
  return (
    <section
      aria-busy={loading || undefined}
      aria-labelledby="verified-research-title"
      className="relative bg-canvas py-[clamp(3.5rem,7vw,6rem)]"
      data-loading={loading || undefined}
    >
      {borderBottom ? <FrameRule edge="bottom" /> : null}
      <PublicShell className="grid gap-12">
        <div className="max-w-[620px]">
          <Eyebrow
            aria-hidden={loading || undefined}
            className={loading ? loadingPlaceholder(true, "text", "short") : ""}
            data-placeholder={loading ? "text" : undefined}
          >
            Research
          </Eyebrow>
          <h2
            aria-hidden={loading || undefined}
            className={cn(
              "my-[.65rem] mb-4 font-sans text-[clamp(2rem,4vw,3.2rem)] leading-[1.02] font-medium tracking-[-.04em]",
              loading && loadingPlaceholder(true, "text", "medium"),
            )}
            data-placeholder={loading ? "text" : undefined}
            id="verified-research-title"
          >
            Research outputs
          </h2>
          <p
            aria-hidden={loading || undefined}
            className={cn(
              "m-0 leading-[1.65] text-ink-muted",
              loading && loadingPlaceholder(true, "text", "long"),
            )}
            data-placeholder={loading ? "text" : undefined}
          >
            Papers, datasets, and projects linked to this profile.
          </p>
        </div>
        {groups.map(({ items, type }) => {
          const visible = loading
            ? items
            : expanded[type]
              ? items
              : items.slice(0, PREVIEW_SIZE);
          return (
            <section className="relative grid gap-5" key={type}>
              <div className="-mx-[var(--public-gutter)] border-t border-line-strong">
                <div className="flex items-center justify-between border-b border-line-strong px-[var(--public-gutter)] pt-3 pb-[.7rem]">
                  <h3
                    aria-hidden={loading || undefined}
                    className={cn(
                      "m-0 font-sans text-xl font-medium tracking-[-.025em]",
                      loading && loadingPlaceholder(true, "text", "short"),
                    )}
                    data-placeholder={loading ? "text" : undefined}
                  >
                    {LABELS[type]}
                  </h3>
                  <span
                    className={cn(
                      "font-mono text-[.75rem] text-brand",
                      loading && loadingPlaceholder(true, "value"),
                    )}
                    data-placeholder={loading ? "value" : undefined}
                  >
                    {loading ? "00" : items.length}
                  </span>
                </div>
                <div className="grid px-[var(--public-gutter)]">
                  {visible.map((item, index) =>
                    type === "PAPER" ? (
                      <PaperCard
                        frame
                        item={item}
                        key={item?.id ?? `loading-paper-${index}`}
                        loading={loading}
                      />
                    ) : (
                      <ResearchCard
                        frame
                        item={item}
                        key={item?.id ?? `loading-record-${index}`}
                        loading={loading}
                        variant="index"
                      />
                    ),
                  )}
                </div>
              </div>
              {!loading && items.length > PREVIEW_SIZE ? (
                <button
                  className="mt-[.9rem] inline-flex w-fit cursor-pointer items-center gap-[.35rem] border-0 bg-transparent p-0 text-[.75rem] font-medium text-brand hover:text-brand-hover"
                  onClick={() =>
                    setExpanded((current) => ({
                      ...current,
                      [type]: !current[type],
                    }))
                  }
                  type="button"
                >
                  {expanded[type] ? "Show fewer" : `See all ${items.length}`}
                  {expanded[type] ? (
                    <ArrowUp aria-hidden="true" size={15} />
                  ) : (
                    <ArrowDown aria-hidden="true" size={15} />
                  )}
                </button>
              ) : null}
            </section>
          );
        })}
      </PublicShell>
    </section>
  );
}
