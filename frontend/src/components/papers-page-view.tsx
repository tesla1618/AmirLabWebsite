import { PageIntro } from "@/components/page-intro";
import { PublicationExplorer } from "@/components/publication-explorer";
import type { ResearchItem } from "@/lib/types";

export function PapersPageView({
  papers,
  loading = false,
}: {
  papers?: ResearchItem[];
  loading?: boolean;
}) {
  const list = papers ?? [];
  const years = list
    .map((item) => item.paper?.year)
    .filter((value): value is number => typeof value === "number");
  const coverage = years.length
    ? `${Math.min(...years)}-${Math.max(...years)}`
    : "Archive";

  return (
    <div>
      <PageIntro
        scene="paper"
        loading={loading}
        eyebrow="Publications"
        meta={
          <>
            <span>{list.length} publications</span>
            <span>{coverage} coverage</span>
            <span>Journal · Conference · Book chapter</span>
            <span>DOI and source links</span>
          </>
        }
        title="Publications"
      >
        Papers, conference proceedings, and book chapters published by AMIR Lab
        researchers and collaborators.
      </PageIntro>
      <PublicationExplorer staticLoading={loading} />
    </div>
  );
}
