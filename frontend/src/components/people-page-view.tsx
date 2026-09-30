import { PageIntro } from "@/components/page-intro";
import { PeopleDirectory } from "@/components/people-layout-showcase";
import { cn } from "@/lib/cn";
import { loadingPlaceholder } from "@/lib/loading-style";
import { peopleGroup } from "@/lib/people-groups";
import type { Person } from "@/lib/types";

export function PeoplePageView({
  people,
  loading = false,
}: {
  people?: Person[];
  loading?: boolean;
}) {
  const list = people ?? [];
  const groups = list.map(peopleGroup);
  const counts = [
    {
      count: groups.filter((group) =>
        ["founder", "advisor", "lead", "senior"].includes(group),
      ).length,
      singular: "Faculty",
      plural: "Faculties",
    },
    {
      count: groups.filter((group) => group === "researcher").length,
      singular: "Researcher",
      plural: "Researchers",
    },
    {
      count: groups.filter((group) => group === "assistant").length,
      singular: "Assistant",
      plural: "Assistants",
    },
    {
      count: groups.filter((group) => group === "intern").length,
      singular: "Intern",
      plural: "Interns",
    },
  ];

  return (
    <>
      <PageIntro
        scene="people"
        loading={loading}
        eyebrow="People"
        meta={
          loading ? (
            <span
              aria-hidden="true"
              className={cn(loadingPlaceholder(true, "text", "long"), "block")}
              data-placeholder="text"
            />
          ) : (
            <span>
              {counts
                .map(
                  ({ count, plural, singular }) =>
                    `${count} ${count === 1 ? singular : plural}`,
                )
                .join(" · ")}
            </span>
          )
        }
        title="People behind the work"
      >
        Meet AMIR Lab researchers, research assistants, interns, advisors, and
        alumni.
      </PageIntro>
      <PeopleDirectory loading={loading} people={list} />
    </>
  );
}
