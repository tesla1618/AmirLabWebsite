import { AnimatedCounter } from "./animated-counter";
import type { PublicStats } from "@/lib/types";
import { cn } from "@/lib/cn";
import { loadingPlaceholder } from "@/lib/loading-style";
import { PublicSection } from "@/components/ui/public-shell";

export function ResearchStats({
  boundary = "bottom",
  stats,
  loading = false,
}: {
  /** "none" when embedded in a band that already frames the row. */
  boundary?: "bottom" | "none";
  stats?: PublicStats;
  loading?: boolean;
}) {
  const value = stats ?? {
    papers: 0,
    people: 0,
    datasets: 0,
    projects: 0,
    openPositions: 0,
  };
  const required = [
    [value.papers, "Publications"],
    [value.people, "People"],
  ] as const;
  const optional = [
    [value.datasets + value.projects, "Datasets & projects"],
    [value.openPositions, "Open positions"],
  ] as const;
  // Optional counts only appear when non-zero, so the loading row reserves the
  // two counts that always render.
  const values = loading
    ? required
    : [...required, ...optional.filter(([count]) => count > 0)];

  return (
    <PublicSection
      aria-busy={loading || undefined}
      aria-label="AmirLab in numbers"
      boundary={boundary}
      contentClassName={cn(
        "grid max-[640px]:grid-cols-2",
        values.length === 2 ? "grid-cols-2" : "grid-cols-4",
      )}
      data-loading={loading || undefined}
    >
      {values.map(([count, label], index) => (
        <article
          className={cn(
            "relative grid gap-[.3rem] border-r border-line px-[1.3rem] py-4 first:pl-0 last:border-r-0 max-[640px]:p-4 max-[640px]:first:pl-4 max-[640px]:even:border-r-0",
            values.length > 2 && index < 2 && "max-[640px]:border-b",
            values.length > 2 && index >= 2 && "max-[640px]:border-b-0",
          )}
          key={label}
        >
          <strong
            className={cn(
              "justify-self-start font-sans text-[2rem] leading-none font-medium tabular-nums text-ink",
              loading && loadingPlaceholder(true, "value"),
            )}
            data-placeholder={loading ? "value" : undefined}
          >
            {loading ? null : <AnimatedCounter value={count} />}
          </strong>
          <span
            aria-hidden={loading || undefined}
            className={cn(
              loading
                ? loadingPlaceholder(true, "label", "medium")
                : "font-mono text-[.62rem] text-ink-muted uppercase",
            )}
            data-placeholder={loading ? "label" : undefined}
          >
            {loading ? null : label}
          </span>
        </article>
      ))}
    </PublicSection>
  );
}
