import { ArrowRight } from "lucide-react";
import { PageIntro } from "@/components/page-intro";
import { ButtonLink } from "@/components/ui/button-control";
import {
  FrameBays,
  FrameRule,
  publicShellClass,
} from "@/components/ui/public-shell";
import { cn } from "@/lib/cn";
import { loadingPlaceholder } from "@/lib/loading-style";
import { DEFAULT_ABOUT_CONTENT } from "@/lib/site-content";
import type { AboutContent } from "@/lib/types";

const eyebrow =
  "m-0 font-mono text-[.66rem] font-semibold tracking-[.105em] text-brand uppercase";
const sectionTitle =
  "m-0 font-sans text-[clamp(1.9rem,3vw,3rem)] leading-[1.08] font-medium tracking-[-.035em]";

function LoadingAction({ width }: { width: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex h-(--control-height) rounded-control",
        width,
        loadingPlaceholder(true, "control"),
      )}
    />
  );
}

export function AboutPageView({
  content = DEFAULT_ABOUT_CONTENT,
  loading = false,
}: {
  content?: AboutContent;
  loading?: boolean;
}) {
  return (
    <div>
      <PageIntro
        eyebrow={content.eyebrow}
        loading={loading}
        scene="about"
        title={content.title}
      >
        {content.introduction}
      </PageIntro>

      <section
        aria-busy={loading || undefined}
        aria-label="AmirLab facts"
        className="relative"
        data-loading={loading || undefined}
      >
        <FrameRule edge="bottom" />
        <div
          className={cn(
            publicShellClass,
            "grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] max-[640px]:grid-cols-1",
          )}
        >
          {content.facts.map((fact, index) => (
            <div
              className={cn(
                "relative grid min-h-[84px] content-center gap-[.35rem] border-r border-line px-[1.3rem] py-4 first:pl-0 last:border-r-0 max-[640px]:min-h-0 max-[640px]:border-r-0 max-[640px]:border-b max-[640px]:px-0 max-[640px]:py-3 max-[640px]:last:border-b-0",
              )}
              key={`${fact.label}-${index}`}
            >
              <span
                aria-hidden={loading || undefined}
                className={cn(
                  "font-mono text-[.62rem] tracking-[.08em] text-ink-muted uppercase",
                  loading && loadingPlaceholder(true, "label", "medium"),
                )}
                data-placeholder={loading ? "label" : undefined}
              >
                {fact.label}
              </span>
              <strong
                aria-hidden={loading || undefined}
                className={cn(
                  "font-sans text-[1.05rem] leading-[1.35] font-medium",
                  loadingPlaceholder(loading, "value"),
                )}
                data-placeholder={loading ? "value" : undefined}
              >
                {fact.value}
              </strong>
            </div>
          ))}
        </div>
      </section>

      <section
        aria-busy={loading || undefined}
        className={cn(
          publicShellClass,
          "grid grid-cols-[minmax(150px,.28fr)_minmax(0,1fr)] gap-[clamp(2rem,5vw,5rem)] py-[clamp(3rem,6vw,5rem)] max-[820px]:grid-cols-1",
        )}
        data-loading={loading || undefined}
      >
        <p className={cn(eyebrow, "max-[820px]:mb-[-1rem]")}>Mission</p>
        <div>
          <h2
            aria-hidden={loading || undefined}
            className={cn(
              sectionTitle,
              "max-w-[850px]",
              loadingPlaceholder(loading, "text", "long"),
            )}
            data-placeholder={loading ? "text" : undefined}
          >
            {content.missionTitle}
          </h2>
          <p
            aria-hidden={loading || undefined}
            className={cn(
              "mt-[1.2rem] mb-0 max-w-[680px] text-[.84rem] leading-[1.7] text-ink-muted",
              loadingPlaceholder(loading, "text", "long"),
            )}
            data-placeholder={loading ? "text" : undefined}
          >
            {content.missionBody}
          </p>
        </div>
      </section>

      <section
        aria-busy={loading || undefined}
        className="relative"
        data-loading={loading || undefined}
      >
        <FrameRule edge="top" />
        <FrameRule edge="bottom" />
        <div
          className={cn(
            publicShellClass,
            "bg-surface py-[clamp(3rem,6vw,5rem)]",
          )}
        >
          <header className="mb-[1.6rem] grid grid-cols-[minmax(150px,.28fr)_minmax(0,1fr)] items-end gap-8 max-[820px]:grid-cols-1">
            <p className={eyebrow}>Research focus</p>
            <h2
              aria-hidden={loading || undefined}
              className={cn(
                sectionTitle,
                loadingPlaceholder(loading, "text", "medium"),
              )}
              data-placeholder={loading ? "text" : undefined}
            >
              {content.focusTitle}
            </h2>
          </header>
          <ul className="-mx-[var(--public-gutter)] -mb-[clamp(3rem,6vw,5rem)] grid list-none grid-cols-2 p-0 max-[640px]:grid-cols-1">
            {content.focusAreas.map((area, index) => (
              <li
                className="grid min-h-16 items-center border-t border-r border-line px-[var(--public-gutter)] py-[.7rem] even:border-r-0 max-[640px]:border-r-0"
                key={`${area}-${index}`}
              >
                <strong
                  aria-hidden={loading || undefined}
                  className={cn(
                    "font-sans text-[.9rem] font-medium",
                    loadingPlaceholder(loading, "text", "medium"),
                  )}
                  data-placeholder={loading ? "text" : undefined}
                >
                  {area}
                </strong>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section
        aria-busy={loading || undefined}
        className={cn(
          publicShellClass,
          "grid grid-cols-[minmax(150px,.28fr)_minmax(0,1fr)] gap-[clamp(2rem,5vw,5rem)] py-[clamp(3rem,6vw,5rem)] max-[820px]:grid-cols-1",
        )}
        data-loading={loading || undefined}
      >
        <p className={cn(eyebrow, "max-[820px]:mb-[-1rem]")}>Organization</p>
        <div>
          <h2
            aria-hidden={loading || undefined}
            className={cn(
              sectionTitle,
              "max-w-[850px]",
              loadingPlaceholder(loading, "text", "long"),
            )}
            data-placeholder={loading ? "text" : undefined}
          >
            {content.organizationTitle}
          </h2>
          <p
            aria-hidden={loading || undefined}
            className={cn(
              "mt-[1.2rem] mb-0 max-w-[680px] text-[.84rem] leading-[1.7] text-ink-muted",
              loadingPlaceholder(loading, "text", "long"),
            )}
            data-placeholder={loading ? "text" : undefined}
          >
            {content.organizationBody}
          </p>
          <div className="mt-[1.3rem]">
            {loading ? (
              <LoadingAction width="w-48" />
            ) : (
              <ButtonLink href="/people" variant="secondary">
                Meet the research team{" "}
                <ArrowRight aria-hidden="true" size={16} />
              </ButtonLink>
            )}
          </div>
        </div>
      </section>

      <section
        aria-busy={loading || undefined}
        className="relative"
        data-loading={loading || undefined}
      >
        <FrameBays pattern="diagonal" />
        <FrameRule edge="top" />
        <div
          className={cn(
            publicShellClass,
            "relative grid grid-cols-[minmax(0,1fr)_auto] bg-surface items-end gap-8 py-[clamp(3rem,6vw,4.5rem)] max-[820px]:grid-cols-1 max-[820px]:items-start",
          )}
        >
          <div className="relative z-[2]">
            <p className={eyebrow}>Connect</p>
            <h2
              aria-hidden={loading || undefined}
              className={cn(
                sectionTitle,
                "mt-[.6rem] mb-[.8rem]",
                loadingPlaceholder(loading, "text", "medium"),
              )}
              data-placeholder={loading ? "text" : undefined}
            >
              {content.closingTitle}
            </h2>
            <p
              aria-hidden={loading || undefined}
              className={cn(
                "m-0 max-w-[680px] text-[.82rem] leading-[1.6] text-ink-muted",
                loadingPlaceholder(loading, "text", "long"),
              )}
              data-placeholder={loading ? "text" : undefined}
            >
              {content.closingBody}
            </p>
          </div>
          <div className="relative z-[2] flex flex-wrap gap-[.6rem] max-[820px]:grid">
            {loading ? (
              <>
                <LoadingAction width="w-44" />
                <LoadingAction width="w-36" />
              </>
            ) : (
              <>
                <ButtonLink href="/open-positions" variant="primary">
                  View open positions{" "}
                  <ArrowRight aria-hidden="true" size={18} />
                </ButtonLink>
                <ButtonLink href="/projects" variant="secondary">
                  Explore projects
                </ButtonLink>
              </>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
