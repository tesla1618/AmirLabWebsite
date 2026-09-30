import { ApplicationForm } from "@/components/application-form";
import { ApplicationProcess } from "@/components/application-process";
import { PageIntro } from "@/components/page-intro";
import { PositionList } from "@/components/position-list";
import { PublicSection } from "@/components/ui/public-shell";
import type { Position } from "@/lib/types";

export function OpenPositionsPageView({
  positions,
  loading = false,
}: {
  positions?: Position[];
  loading?: boolean;
}) {
  const list = positions ?? [];
  return (
    <>
      <PageIntro
        scene="position"
        loading={loading}
        eyebrow="Careers & opportunities"
        meta={
          <>
            <span>Research roles · Internships</span>
            <span>Apply with a CV</span>
          </>
        }
        title="Open opportunities"
      >
        Current AMIR Lab research roles and internships. Applications are
        reviewed by the lab team.
      </PageIntro>
      <PositionList loading={loading} positions={list} />
      <PublicSection
        contentClassName="grid grid-cols-[minmax(0,1fr)_minmax(280px,360px)] items-start gap-[clamp(1.5rem,3vw,3rem)] pt-8 pb-16 max-[900px]:grid-cols-1"
        id="apply"
      >
        <ApplicationForm loading={loading} positions={list} />
        <div>
          <ApplicationProcess loading={loading} />
        </div>
      </PublicSection>
    </>
  );
}
