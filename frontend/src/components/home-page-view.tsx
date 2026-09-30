import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { PageIntro } from "@/components/page-intro";
import { PaperCard } from "@/components/paper-card";
import { ResearchCard } from "@/components/research-card";
import { ResearchStats } from "@/components/research-stats";
import { StatePanel } from "@/components/state-panel";
import { UniversitiesMarquee } from "@/components/universities-marquee";
import { ButtonLink } from "@/components/ui/button-control";
import {
  FrameBays,
  FrameRule,
  publicShellClass,
} from "@/components/ui/public-shell";
import { cn } from "@/lib/cn";
import { DEFAULT_HOME_CONTENT } from "@/lib/site-content";
import type {
  HomeContent,
  Position,
  PublicStats,
  ResearchItem,
  University,
} from "@/lib/types";

const EMPTY_STATS: PublicStats = {
  papers: 0,
  people: 0,
  datasets: 0,
  projects: 0,
  openPositions: 0,
};
const eyebrow =
  "font-mono text-[.66rem] font-semibold tracking-[.105em] text-brand uppercase";

export function HomePageView({
  content = DEFAULT_HOME_CONTENT,
  research = [],
  positions = [],
  stats = EMPTY_STATS,
  universities = [],
  loading = false,
}: {
  content?: HomeContent;
  research?: ResearchItem[];
  positions?: Position[];
  stats?: PublicStats;
  universities?: University[];
  loading?: boolean;
}) {
  const researchRows: Array<ResearchItem | undefined> = loading
    ? Array.from({ length: 3 }, () => undefined)
    : research.slice(0, 3);
  return (
    <div>
      <PageIntro
        actions={
          <>
            <ButtonLink href="/papers" variant="primary">
              {content.primaryCtaLabel}{" "}
              <ArrowRight aria-hidden="true" size={18} />
            </ButtonLink>
            <ButtonLink href="/people" variant="secondary">
              {content.secondaryCtaLabel}
            </ButtonLink>
          </>
        }
        eyebrow={content.establishment}
        loading={loading}
        scene="home"
        title={content.heroTitle}
      >
        {content.heroIntroduction}
      </PageIntro>

      {loading || universities.length > 0 ? (
        <section aria-label="Academic partners" className="relative pb-10">
          <FrameBays pattern="dot" />
          <FrameRule edge="bottom" />
          <p
            className={cn(
              publicShellClass,
              "mb-0 pt-10 pb-4 font-mono text-[.58rem] font-medium tracking-[.1em] text-ink-faint uppercase",
            )}
          >
            Academic partners
          </p>
          <UniversitiesMarquee loading={loading} universities={universities} />
          <ResearchStats boundary="none" loading={loading} stats={stats} />
          <UniversitiesMarquee
            direction="right"
            loading={loading}
            universities={universities}
          />
        </section>
      ) : (
        <ResearchStats stats={stats} />
      )}

      <section
        className={cn(publicShellClass, "py-[clamp(3.25rem,6vw,5.5rem)]")}
        data-loading={loading || undefined}
      >
        <div className="mb-[1.4rem] flex items-end justify-between gap-5 max-[640px]:flex-col max-[640px]:items-start">
          <div>
            <p className={cn(eyebrow, "mb-[.65rem]")}>
              {content.latestEyebrow}
            </p>
            <h2 className="m-0 font-sans text-[clamp(1.9rem,3vw,3rem)] font-medium tracking-[-.035em]">
              {content.latestTitle}
            </h2>
          </div>
          <Link
            className="text-[.76rem] font-semibold text-brand underline decoration-[color-mix(in_srgb,var(--brand)_35%,transparent)] underline-offset-[3px]"
            href="/papers"
            prefetch={false}
          >
            View all{" "}
            <ArrowRight aria-hidden="true" className="inline" size={16} />
          </Link>
        </div>
        {researchRows.length ? (
          <div className="grid gap-0">
            {researchRows.map((item, index) =>
              !item || item.type === "PAPER" ? (
                <PaperCard
                  frame
                  item={item}
                  key={item?.id ?? `loading-paper-${index}`}
                  loading={loading}
                />
              ) : (
                <ResearchCard item={item} key={item.id} loading={false} />
              ),
            )}
          </div>
        ) : (
          <StatePanel
            body="Published work will appear here when available."
            title="No publications yet"
          />
        )}
      </section>

      <section className="relative">
        <FrameBays pattern="diagonal" />
        <FrameRule edge="top" />
        <div
          className={cn(
            publicShellClass,
            "grid grid-cols-[minmax(0,1fr)_auto] items-end gap-8 bg-surface py-[3.8rem] max-[900px]:grid-cols-1",
          )}
        >
          <div>
            <p className="mb-[.65rem] font-mono text-[.66rem] font-semibold tracking-[.105em] text-brand uppercase">
              {content.recruitmentEyebrow}
            </p>
            <h2 className="mt-2 mb-[.8rem] max-w-[720px] font-sans text-[clamp(2rem,4vw,3rem)] leading-[1.05] font-medium tracking-[-.035em] text-ink">
              {content.recruitmentTitle}
            </h2>
            <p className="m-0 max-w-[650px] text-[.8rem] leading-[1.6] text-ink-muted">
              {content.recruitmentBody}
            </p>
          </div>
          <ButtonLink
            className="m-0 max-[900px]:justify-self-start"
            href="/open-positions"
            variant="primary"
          >
            {loading
              ? "Explore opportunities"
              : positions.length
                ? `View ${positions.length} open ${positions.length === 1 ? "role" : "roles"}`
                : "Explore opportunities"}
            <ArrowRight aria-hidden="true" size={18} />
          </ButtonLink>
        </div>
      </section>
    </div>
  );
}
