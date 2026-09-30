"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowDown, ArrowRight, ArrowUp, MoveUpRight } from "lucide-react";
import { PersonPortrait } from "@/components/person-portrait";
import { FrameRule, publicShellClass } from "@/components/ui/public-shell";
import { cn } from "@/lib/cn";
import { loadingPlaceholder } from "@/lib/loading-style";
import { peopleGroup, type PeopleGroup } from "@/lib/people-groups";
import type { Person } from "@/lib/types";

const PEOPLE_SECTION_PREVIEW_LIMIT = 6;
const GROUPS: Array<{ key: PeopleGroup; title: string }> = [
  { key: "advisor", title: "Advisors" },
  { key: "lead", title: "Lead Researchers" },
  { key: "senior", title: "Senior Researchers" },
  { key: "researcher", title: "Researchers" },
  { key: "assistant", title: "Research Assistants" },
  { key: "intern", title: "Research Interns" },
  { key: "other", title: "Members" },
];

function personRole(person: Person): string {
  return (
    person.roleTitle ?? person.rank?.replaceAll("_", " ") ?? "AmirLab member"
  );
}

export function PeopleDirectory({
  people = [],
  loading = false,
}: {
  people?: Person[];
  loading?: boolean;
}) {
  const grouped = Map.groupBy(people, peopleGroup);
  const founder = grouped.get("founder")?.[0];
  const visibleGroups = GROUPS.flatMap((group) => {
    const members = grouped.get(group.key) ?? [];
    return members.length ? [{ ...group, members }] : [];
  });
  const alumni = grouped.get("alumni") ?? [];
  const loadingGroups = GROUPS.slice(0, 3).map((group) => ({
    ...group,
    members: [] as Person[],
  }));
  const groups = loading ? loadingGroups : visibleGroups;

  return (
    <div
      aria-busy={loading || undefined}
      className="grid w-full pb-20"
      data-loading={loading || undefined}
    >
      {founder || loading ? (
        <Founder loading={loading} person={founder} />
      ) : null}

      {groups.map(({ key, title, members }, index) => (
        <PeopleSection
          key={key}
          loading={loading}
          members={members}
          showRule={index > 0 || Boolean(founder || loading)}
          title={title}
        />
      ))}

      {!loading && alumni.length ? (
        <PeopleSection members={alumni} showRule title="Alumni" />
      ) : null}
    </div>
  );
}

function Founder({
  person,
  loading = false,
}: {
  person?: Person;
  loading?: boolean;
}) {
  const href = person ? `/people/${person.slug}` : "/people";
  return (
    <section className="relative" data-loading={loading || undefined}>
      <div
        className={cn(
          publicShellClass,
          "pt-[1.2rem] pb-[2.6rem] max-[720px]:pt-[1rem] max-[480px]:pb-[1.8rem]",
        )}
      >
        <PeopleHeading title="Founder & Research Director" />
        <article className="grid grid-cols-[minmax(180px,240px)_minmax(0,1fr)] items-center gap-[clamp(1.8rem,4vw,4rem)] max-[720px]:grid-cols-[120px_minmax(0,1fr)] max-[480px]:grid-cols-[96px_minmax(0,1fr)] max-[480px]:items-center max-[480px]:gap-4">
          {loading ? (
            <div aria-hidden="true" className="min-w-0">
              <PersonPortrait
                loading
                person={person}
                priority
                variant="founder"
              />
            </div>
          ) : (
            <Link className="min-w-0" href={href}>
              <PersonPortrait
                loading={loading}
                person={person}
                priority
                variant="founder"
              />
            </Link>
          )}
          <div className="grid min-w-0 max-w-[760px] content-center">
            <h2
              className={cn(
                "mb-0 mt-[.15rem] font-sans text-[clamp(2rem,3.8vw,3.6rem)] font-medium leading-[.98] tracking-[-.045em] max-[720px]:text-[clamp(1.65rem,8vw,2.4rem)] max-[480px]:text-[clamp(1.35rem,6.5vw,1.7rem)]",
                loadingPlaceholder(loading, "text", "long"),
              )}
              data-placeholder={loading ? "text" : undefined}
            >
              {loading ? (
                <span aria-hidden="true">Research director name</span>
              ) : (
                <Link href={href}>{person?.fullName}</Link>
              )}
            </h2>
            {loading ||
            (person?.roleTitle &&
              person.roleTitle.toLowerCase() !==
                "founder & research director") ? (
              <p
                aria-hidden={loading || undefined}
                className={cn(
                  "mt-[.55rem] text-[.85rem] leading-[1.5] text-ink-muted",
                  loadingPlaceholder(loading, "text", "medium"),
                )}
                data-placeholder={loading ? "text" : undefined}
              >
                {loading ? "Role is loading" : person?.roleTitle}
              </p>
            ) : null}
            {loading || person?.headline ? (
              <p
                aria-hidden={loading || undefined}
                className={cn(
                  "mt-[.55rem] font-mono text-[.64rem] leading-[1.5] text-ink-muted",
                  loadingPlaceholder(loading, "text", "long"),
                )}
                data-placeholder={loading ? "text" : undefined}
              >
                {loading ? "Affiliation is loading" : person?.headline}
              </p>
            ) : null}
            {loading || person?.biography ? (
              <p
                aria-hidden={loading || undefined}
                className={cn(
                  "mt-4 line-clamp-4 max-w-[700px] text-[.82rem] leading-[1.65] text-ink-muted max-[720px]:hidden",
                  loadingPlaceholder(loading, "text", "full"),
                )}
                data-placeholder={loading ? "text" : undefined}
              >
                {loading ? "Biography is loading" : person?.biography}
              </p>
            ) : null}
            {loading ? (
              <span
                aria-hidden="true"
                className="mt-4 h-[.75rem] w-28 bg-surface-subtle"
              />
            ) : (
              <Link
                className="mt-4 inline-flex w-fit items-center gap-[.45rem] text-[.78rem] font-bold text-brand max-[480px]:mt-3 max-[480px]:text-[.72rem]"
                href={href}
              >
                View full profile <ArrowRight aria-hidden="true" size={16} />
              </Link>
            )}
          </div>
        </article>
      </div>
    </section>
  );
}

function PeopleHeading({
  title,
  count,
  loading = false,
}: {
  title: string;
  count?: number;
  loading?: boolean;
}) {
  return (
    <header className="mb-[1.15rem] flex items-baseline justify-between gap-[.8rem]">
      <h2 className="font-sans text-[clamp(1.55rem,2.3vw,2.25rem)] font-medium tracking-[-.025em]">
        {title}
      </h2>
      {count !== undefined || loading ? (
        <span
          className={cn(
            "font-mono text-[.58rem] uppercase tracking-[.07em] text-ink-faint",
            loadingPlaceholder(loading, "value", "short"),
          )}
          data-placeholder={loading ? "value" : undefined}
        >
          <span aria-hidden={loading || undefined}>
            {loading ? "—" : `${count} ${count === 1 ? "member" : "members"}`}
          </span>
        </span>
      ) : null}
    </header>
  );
}

function PeopleSection({
  members,
  title,
  loading = false,
  showRule = true,
}: {
  members: Person[];
  title: string;
  loading?: boolean;
  showRule?: boolean;
}) {
  return (
    <section className="relative" data-loading={loading || undefined}>
      {showRule ? <FrameRule edge="top" stroke="dashed" /> : null}
      <div
        className={cn(
          publicShellClass,
          "pt-[1.3rem] pb-[2.4rem] max-[720px]:pb-[1.8rem]",
        )}
      >
        <PeopleHeading count={members.length} loading={loading} title={title} />
        <MemberCollection loading={loading} members={members} title={title} />
      </div>
    </section>
  );
}

function MemberCollection({
  members,
  loading = false,
  title,
}: {
  members: Person[];
  loading?: boolean;
  title: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const hasMore = !loading && members.length > PEOPLE_SECTION_PREVIEW_LIMIT;
  const visibleMembers = loading
    ? Array.from({ length: PEOPLE_SECTION_PREVIEW_LIMIT }, () => undefined)
    : expanded
      ? members
      : members.slice(0, PEOPLE_SECTION_PREVIEW_LIMIT);

  return (
    <>
      <div className="-mx-[var(--public-gutter)] grid grid-cols-2 border-t border-line max-[720px]:grid-cols-1">
        {visibleMembers.map((person, index) => (
          <Member
            key={person?.id ?? `loading-${index}`}
            fullWidth={
              !loading &&
              (!hasMore || expanded) &&
              members.length % 2 === 1 &&
              index === visibleMembers.length - 1
            }
            loading={loading}
            groupTitle={title}
            person={person}
            position={index}
          />
        ))}
      </div>
      {hasMore ? (
        <button
          aria-expanded={expanded}
          className="mt-[.9rem] inline-flex cursor-pointer items-center gap-[.35rem] border-0 border-b border-brand bg-transparent px-0 py-1 text-[.68rem] font-semibold text-brand"
          onClick={() => setExpanded((current) => !current)}
          type="button"
        >
          {expanded ? "Show less" : `See all ${members.length}`}
          {expanded ? (
            <ArrowUp aria-hidden="true" size={15} />
          ) : (
            <ArrowDown aria-hidden="true" size={15} />
          )}
        </button>
      ) : null}
    </>
  );
}

function Member({
  position,
  person,
  loading = false,
  groupTitle,
  fullWidth = false,
}: {
  position: number;
  person?: Person;
  loading?: boolean;
  groupTitle: string;
  fullWidth?: boolean;
}) {
  const href = person ? `/people/${person.slug}` : "/people";
  const odd = position % 2 === 0;
  const role = person ? personRole(person) : "Research role";
  const compactLabel = (value: string) =>
    value.toLowerCase().replace(/s\b/g, "");
  const showRole = !person || compactLabel(role) !== compactLabel(groupTitle);
  const className = cn(
    "group relative grid min-w-0 grid-cols-[66px_minmax(0,1fr)_auto] items-center gap-[.85rem] border-b border-line px-[var(--public-gutter)] py-[.82rem] text-inherit no-underline max-[480px]:grid-cols-[56px_minmax(0,1fr)_auto]",
    fullWidth && "col-span-2 max-[720px]:col-span-1",
    odd && !fullWidth && "border-r border-line max-[720px]:border-r-0",
  );
  const content = (
    <>
      <PersonPortrait loading={loading} person={person} />
      <div className="min-w-0">
        <h3
          aria-hidden={loading || undefined}
          className={cn(
            "mb-1 mt-[.08rem] font-sans text-[1.02rem] font-medium leading-[1.25] group-hover:text-brand group-hover:underline group-hover:decoration-[.06em] group-hover:underline-offset-4 group-focus-visible:underline",
            loadingPlaceholder(loading, "text", "medium"),
          )}
          data-placeholder={loading ? "text" : undefined}
        >
          {person?.fullName ?? "Research member"}
        </h3>
        {showRole ? (
          <p
            aria-hidden={loading || undefined}
            className={cn(
              "m-0 block overflow-hidden text-ellipsis whitespace-nowrap text-[.7rem] leading-[1.4] text-ink-muted",
              loadingPlaceholder(loading, "text", "short"),
            )}
            data-placeholder={loading ? "text" : undefined}
          >
            {role}
          </p>
        ) : null}
        {loading ||
        (person?.headline && person.headline !== person.roleTitle) ? (
          <small
            aria-hidden={loading || undefined}
            className={cn(
              "mt-[.18rem] block overflow-hidden text-ellipsis whitespace-nowrap font-mono text-[.56rem] leading-[1.4] text-ink-muted",
              loadingPlaceholder(loading, "text", "long"),
            )}
            data-placeholder={loading ? "text" : undefined}
          >
            {person?.headline ?? "Research area and affiliation"}
          </small>
        ) : null}
      </div>
      <MoveUpRight
        aria-hidden="true"
        className={cn(
          "text-ink-faint transition-transform group-hover:translate-x-[2px] group-hover:-translate-y-[2px] group-hover:text-brand",
          loading && "opacity-[.12]",
        )}
        data-loading-icon={loading || undefined}
        size={19}
      />
    </>
  );
  return loading ? (
    <div aria-hidden="true" className={className}>
      {content}
    </div>
  ) : (
    <Link className={className} href={href}>
      {content}
    </Link>
  );
}
