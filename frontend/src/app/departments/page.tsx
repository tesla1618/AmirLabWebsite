import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { PageIntro } from "@/components/page-intro";
import { StatePanel } from "@/components/state-panel";
import {
  FramedCollection,
  FramedRow,
  PublicSection,
} from "@/components/ui/public-shell";
import { getDepartments } from "@/lib/api";

export const metadata: Metadata = { title: "Departments" };

export default async function DepartmentsPage() {
  const departments = await getDepartments();
  const people = departments.reduce(
    (sum, department) =>
      sum + (department._count?.people ?? department.people.length),
    0,
  );
  return (
    <div className="pb-[clamp(4rem,7vw,6rem)]">
      <PageIntro
        scene="department"
        eyebrow="Research units"
        meta={
          <>
            <span>
              {departments.length}{" "}
              {departments.length === 1 ? "department" : "departments"}
            </span>
            <span>
              {people} {people === 1 ? "member" : "members"}
            </span>
            <span>Research areas and teams</span>
          </>
        }
        title="Departments"
      >
        AMIR Lab departments group researchers by area while allowing projects
        and publications to involve members from multiple departments.
      </PageIntro>

      <PublicSection
        contentClassName={departments.length ? "pb-10" : "pt-8 pb-10"}
      >
        {departments.length ? (
          <FramedCollection className="grid">
            {departments.map((department) => {
              const memberCount =
                department._count?.people ?? department.people.length;
              return (
                <FramedRow key={department.id}>
                  <Link
                    className="group grid min-h-[112px] grid-cols-[130px_minmax(0,1fr)_auto] items-center gap-[clamp(1rem,3vw,3rem)] px-[var(--public-gutter)] py-5 transition-colors duration-[140ms] hover:bg-[color-mix(in_srgb,var(--brand-faint)_65%,transparent)] max-[640px]:min-h-0 max-[640px]:grid-cols-[minmax(0,1fr)_auto] max-[640px]:gap-x-4 max-[640px]:gap-y-2"
                    href={`/departments/${department.slug}`}
                  >
                    <span className="font-mono text-[.58rem] tracking-[.08em] text-brand uppercase max-[640px]:col-start-1 max-[640px]:row-start-1">
                      {department.abbreviation ?? "Research unit"}
                    </span>
                    <h2 className="m-0 max-w-[760px] font-sans text-[clamp(1.35rem,2.4vw,2rem)] leading-[1.08] font-medium tracking-[-.035em] max-[640px]:col-start-1 max-[640px]:row-start-2">
                      {department.name.replace(/^Department of\s+/i, "")}
                    </h2>
                    <span className="flex items-center justify-end gap-8 max-[640px]:col-start-2 max-[640px]:row-span-2 max-[640px]:row-start-1 max-[640px]:gap-4">
                      <span className="font-mono text-[.58rem] tracking-[.06em] text-ink-faint uppercase">
                        {memberCount} {memberCount === 1 ? "member" : "members"}
                      </span>
                      <ArrowUpRight
                        aria-hidden="true"
                        className="text-ink-muted transition-colors duration-[140ms] group-hover:text-brand"
                        size={17}
                      />
                    </span>
                  </Link>
                </FramedRow>
              );
            })}
          </FramedCollection>
        ) : (
          <StatePanel
            body="Published research departments will appear here when available."
            frame
            title="No departments published yet"
          />
        )}
      </PublicSection>
    </div>
  );
}
