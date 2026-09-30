import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowUpRight } from "lucide-react";
import { PersonPortrait } from "@/components/person-portrait";
import { StatePanel } from "@/components/state-panel";
import {
  FramedCollection,
  FramedRow,
  PublicSection,
} from "@/components/ui/public-shell";
import { getDepartment } from "@/lib/api";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const department = await getDepartment((await params).slug);
  return { title: department?.name ?? "Department" };
}

export default async function DepartmentPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const department = await getDepartment((await params).slug);
  if (!department) notFound();
  return (
    <div className="pb-[clamp(4rem,7vw,6rem)]">
      <PublicSection
        as="header"
        boundary="bottom"
        contentClassName="min-h-0 py-[clamp(2.5rem,5vw,4rem)]"
      >
        <Link
          className="mb-16 inline-flex items-center gap-[.4rem] text-[.76rem] text-brand"
          href="/departments"
        >
          <ArrowLeft size={15} /> All departments
        </Link>
        <p className="mb-[.65rem] font-mono text-[.66rem] font-semibold tracking-[.105em] text-brand uppercase">
          {department.abbreviation ? `${department.abbreviation} · ` : ""}
          Research unit
        </p>
        <h1 className="my-4 max-w-[1050px] font-serif text-[clamp(2.5rem,5vw,4.5rem)] leading-[.95] font-[380] tracking-[-.055em]">
          {department.name}
        </h1>
        <p className="max-w-[800px] text-[1.05rem] leading-[1.75] text-ink-muted">
          {department.description}
        </p>
      </PublicSection>
      <PublicSection contentClassName="py-16">
        <div className="mb-10 flex items-end justify-between">
          <div>
            <p className="mb-[.65rem] font-mono text-[.66rem] font-semibold tracking-[.105em] text-brand uppercase">
              People
            </p>
            <h2 className="mt-2 font-serif text-[clamp(2.2rem,5vw,4rem)] font-normal">
              Department team
            </h2>
          </div>
          <span className="font-mono text-[.68rem] text-ink-muted">
            {department.people.length} members
          </span>
        </div>
        {department.people.length ? (
          <div className="grid grid-cols-4 gap-px max-[800px]:grid-cols-2 max-[520px]:grid-cols-1">
            {department.people.map(({ person, role }) => (
              <Link
                className="-mt-px -ml-px grid border border-line bg-surface p-5"
                href={`/people/${person.slug}`}
                key={person.id}
              >
                <PersonPortrait person={person} variant="department" />
                <span className="mt-4 font-mono text-[.6rem] text-brand uppercase">
                  {role === "HEAD"
                    ? "Department head"
                    : role === "LEAD"
                      ? "Lead researcher"
                      : person.rank?.replaceAll("_", " ")}
                </span>
                <h3 className="mt-[.3rem] mb-[.8rem] font-serif text-[1.2rem] font-[450]">
                  {person.fullName}
                </h3>
                <ArrowUpRight
                  aria-hidden="true"
                  className="justify-self-end text-brand"
                  size={16}
                />
              </Link>
            ))}
          </div>
        ) : (
          <StatePanel
            body="Department members will appear here when the roster is published."
            frame
            title="No members listed yet"
          />
        )}
      </PublicSection>
      {department.researchItems?.length ? (
        <PublicSection boundary="top" contentClassName="py-16">
          <div className="mb-10 flex items-end justify-between">
            <div>
              <p className="mb-[.65rem] font-mono text-[.66rem] font-semibold tracking-[.105em] text-brand uppercase">
                Outputs
              </p>
              <h2 className="mt-2 font-serif text-[clamp(2.2rem,5vw,4rem)] font-normal">
                Research from this department
              </h2>
            </div>
          </div>
          <FramedCollection className="grid" topRule>
            {department.researchItems.map(({ researchItem }) => {
              const content = (
                <>
                  <span className="m-0 font-mono text-[.6rem] text-brand uppercase">
                    {researchItem.type}
                  </span>
                  <h3 className="m-0 font-serif text-[1.2rem] font-[450]">
                    {researchItem.title}
                  </h3>
                  {researchItem.type === "PROJECT" ||
                  researchItem.canonicalUrl ? (
                    <ArrowUpRight size={16} />
                  ) : (
                    <span />
                  )}
                </>
              );
              if (researchItem.type === "PROJECT")
                return (
                  <FramedRow key={researchItem.id}>
                    <Link
                      className="grid grid-cols-[100px_1fr_auto] items-center px-[var(--public-gutter)] py-4"
                      href={`/projects/${researchItem.slug}`}
                    >
                      {content}
                    </Link>
                  </FramedRow>
                );
              if (researchItem.canonicalUrl)
                return (
                  <FramedRow key={researchItem.id}>
                    <a
                      className="grid grid-cols-[100px_1fr_auto] items-center px-[var(--public-gutter)] py-4"
                      href={researchItem.canonicalUrl}
                      rel="noreferrer"
                      target="_blank"
                    >
                      {content}
                    </a>
                  </FramedRow>
                );
              return (
                <FramedRow
                  as="article"
                  className="grid grid-cols-[100px_1fr_auto] items-center px-[var(--public-gutter)] py-4"
                  key={researchItem.id}
                >
                  {content}
                </FramedRow>
              );
            })}
          </FramedCollection>
        </PublicSection>
      ) : null}
    </div>
  );
}
