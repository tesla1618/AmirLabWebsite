import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowUpRight, Check, Circle } from "lucide-react";
import {
  Eyebrow,
  PublicSection,
  PublicShell,
} from "@/components/ui/public-shell";
import { getResearchItem } from "@/lib/api";
import { cn } from "@/lib/cn";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const item = await getResearchItem((await params).slug);
  return { title: item?.title ?? "Project" };
}

const statusBadge =
  "inline-flex rounded-[2px] border border-brand bg-transparent px-[.45rem] py-[.22rem] font-mono text-[.52rem] text-brand uppercase";

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const item = await getResearchItem((await params).slug);
  if (!item?.project) notFound();
  const project = item.project;
  const milestones = project.milestones ?? [];
  const totalWeight = milestones.reduce(
    (sum, milestone) => sum + milestone.weight,
    0,
  );
  const progress = totalWeight
    ? Math.round(
        milestones.reduce(
          (sum, milestone) => sum + milestone.progress * milestone.weight,
          0,
        ) / totalWeight,
      )
    : 0;
  const objectives = project.objectives?.length
    ? project.objectives
    : project.objective
      ? [
          {
            id: "main",
            title: project.objective,
            description: item.summary,
            sortOrder: 0,
          },
        ]
      : [];
  const navigation = [
    ...(objectives.length ? [["#objectives", "Objectives"] as const] : []),
    ["#milestones", "Milestones"] as const,
    ["#updates", "Updates"] as const,
    ["#team", "Team"] as const,
  ];

  return (
    <div>
      <PublicSection
        as="header"
        boundary="bottom"
        contentClassName="grid grid-cols-[minmax(0,1.35fr)_minmax(260px,.65fr)] items-end gap-[clamp(2rem,5vw,4.5rem)] py-[clamp(2.4rem,5vw,4rem)] max-[760px]:grid-cols-1"
      >
        <div className="relative z-[1]">
          <div className="mb-3 flex items-center gap-[.65rem] font-mono text-[.56rem] text-ink-muted uppercase">
            {project.status ? (
              <span className={statusBadge}>
                {project.status.replaceAll("_", " ")}
              </span>
            ) : null}
            <span>Research project</span>
          </div>
          <h1 className="m-0 font-serif text-[clamp(2.5rem,5vw,4.7rem)] leading-[.96] font-medium tracking-[-.045em]">
            {item.title}
          </h1>
          {item.summary || project.objective ? (
            <p className="mt-4 max-w-[720px] text-[.86rem] leading-[1.65] text-ink-muted">
              {item.summary ?? project.objective}
            </p>
          ) : null}
        </div>
        <aside className="relative z-[1] border-t border-line-strong pt-[.7rem]">
          <div className="flex items-end justify-between">
            <strong className="font-mono text-[1.6rem] font-medium">
              {progress}%
            </strong>
            <span className="font-mono text-[.54rem] text-ink-muted uppercase">
              Overall progress
            </span>
          </div>
          <svg
            aria-label={`${progress}% complete`}
            className="my-[.65rem] h-[2px] w-full"
            preserveAspectRatio="none"
            role="img"
            viewBox="0 0 100 2"
          >
            <rect className="fill-line" height="2" width="100" x="0" y="0" />
            <rect
              className="fill-brand"
              height="2"
              width={progress}
              x="0"
              y="0"
            />
          </svg>
          <dl className="grid grid-cols-2 gap-[.6rem]">
            <div className="border-t border-line pt-2">
              <dt className="font-mono text-[.54rem] text-ink-muted uppercase">
                Milestones
              </dt>
              <dd className="mt-[.2rem] mb-0 text-[.7rem]">
                {milestones.filter((m) => m.status === "COMPLETE").length} /{" "}
                {milestones.length}
              </dd>
            </div>
            <div className="border-t border-line pt-2">
              <dt className="font-mono text-[.54rem] text-ink-muted uppercase">
                Team
              </dt>
              <dd className="mt-[.2rem] mb-0 text-[.7rem]">
                {project.memberships?.length ?? 0}
              </dd>
            </div>
          </dl>
        </aside>
      </PublicSection>
      <PublicShell className="grid grid-cols-[180px_minmax(0,1fr)] gap-[clamp(2rem,5vw,4.5rem)] py-[clamp(2.5rem,5vw,4rem)] max-[760px]:grid-cols-1">
        <aside className="sticky top-[76px] grid self-start max-[760px]:hidden">
          <Eyebrow>On this page</Eyebrow>
          {navigation.map(([href, label]) => (
            <a
              className="border-b border-line py-[.62rem] text-[.68rem] text-ink-muted hover:text-brand"
              href={href}
              key={href}
            >
              {label}
            </a>
          ))}
        </aside>
        <div className="grid gap-[3.6rem]">
          {objectives.length ? (
            <ProjectSection
              eyebrow="Direction"
              id="objectives"
              title="Project objectives"
            >
              <ul className="m-0 list-none p-0">
                {objectives.map((objective) => (
                  <li
                    className="border-t border-line py-[.9rem]"
                    key={objective.id}
                  >
                    <div>
                      <h3 className="my-[.2rem] font-serif text-[1.05rem] font-medium">
                        {objective.title}
                      </h3>
                      {objective.description ? (
                        <p className="text-[.72rem] leading-[1.55] text-ink-muted">
                          {objective.description}
                        </p>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            </ProjectSection>
          ) : null}
          <ProjectSection eyebrow="Roadmap" id="milestones" title="Milestones">
            <div>
              {milestones.map((milestone, index) => (
                <article
                  className="relative grid grid-cols-[78px_20px_1fr] gap-[.85rem] py-[.8rem]"
                  key={milestone.id}
                >
                  <time className="pt-[.2rem] text-right font-mono text-[.54rem] text-ink-muted">
                    {milestone.dueAt
                      ? new Date(milestone.dueAt).toLocaleDateString("en", {
                          month: "short",
                          year: "numeric",
                        })
                      : "Unscheduled"}
                  </time>
                  <span
                    className={cn(
                      "z-[1] flex h-[19px] items-center justify-center rounded-full border border-line bg-surface",
                      milestone.status === "COMPLETE" &&
                        "border-brand bg-brand text-white",
                    )}
                  >
                    {milestone.status === "COMPLETE" ? (
                      <Check size={13} />
                    ) : (
                      <Circle size={10} />
                    )}
                  </span>
                  {index < milestones.length - 1 ? (
                    <span
                      aria-hidden="true"
                      className="absolute top-[27px] bottom-0 left-[87px] w-px bg-line"
                    />
                  ) : null}
                  <div>
                    <span className={statusBadge}>
                      {milestone.status.replaceAll("_", " ")}
                    </span>
                    <h3 className="my-[.2rem] font-serif text-[1.05rem] font-medium">
                      {milestone.title}
                    </h3>
                    {milestone.description ? (
                      <p className="text-[.72rem] leading-[1.55] text-ink-muted">
                        {milestone.description}
                      </p>
                    ) : null}
                    <small className="font-mono text-[.52rem] text-ink-faint">
                      {milestone.progress}% complete · {milestone.weight}%
                      weight
                    </small>
                  </div>
                </article>
              ))}
            </div>
          </ProjectSection>
          <ProjectSection
            eyebrow="Journal"
            id="updates"
            title="Project updates"
          >
            <div className="border-t border-line">
              {project.updates?.length ? (
                project.updates.map((update) => (
                  <article
                    className="grid grid-cols-[86px_1fr] gap-[.9rem] border-b border-line py-[.85rem]"
                    key={update.id}
                  >
                    <time className="font-mono text-[.54rem] text-ink-faint">
                      {new Date(
                        update.publishedAt ?? update.createdAt,
                      ).toLocaleDateString()}
                    </time>
                    <div>
                      <h3 className="my-[.2rem] font-serif text-[1.05rem] font-medium">
                        {update.title}
                      </h3>
                      <p className="text-[.72rem] leading-[1.55] text-ink-muted">
                        {update.body}
                      </p>
                    </div>
                  </article>
                ))
              ) : (
                <p className="py-[.8rem] text-ink-muted">
                  No public updates yet.
                </p>
              )}
            </div>
          </ProjectSection>
          <ProjectSection
            eyebrow="Collaborators"
            id="team"
            title="Project team"
          >
            <div className="grid grid-cols-2 border-t border-line max-[760px]:grid-cols-1">
              {project.memberships?.map(({ person, role }) => (
                <Link
                  className="grid border-b border-line p-[.8rem] hover:bg-brand-faint"
                  href={`/people/${person.slug}`}
                  key={person.id}
                >
                  <span className="font-mono text-[.52rem] text-brand">
                    {role}
                  </span>
                  <h3 className="my-[.2rem] font-serif text-[1.05rem] font-medium">
                    {person.fullName}
                  </h3>
                  <ArrowUpRight className="justify-self-end" size={16} />
                </Link>
              ))}
            </div>
          </ProjectSection>
        </div>
      </PublicShell>
    </div>
  );
}

function ProjectSection({
  children,
  eyebrow,
  id,
  title,
}: {
  children: React.ReactNode;
  eyebrow: string;
  id: string;
  title: string;
}) {
  return (
    <section id={id}>
      <Eyebrow>{eyebrow}</Eyebrow>
      <h2 className="mt-[.4rem] mb-[1.15rem] font-serif text-[clamp(1.8rem,3.5vw,2.9rem)] font-medium tracking-[-.03em]">
        {title}
      </h2>
      {children}
    </section>
  );
}
