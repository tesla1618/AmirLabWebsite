import { WorkspacePageShell } from "@/components/workspace-page-shell";
import { ApplicationReviewQueue } from "@/components/application-review-queue";

/** `/workspace/applications` and `/…/{id}` are one master/detail page. */
export default function ApplicationsReviewPage() {
  return (
    <WorkspacePageShell>
      <ApplicationReviewQueue />
    </WorkspacePageShell>
  );
}
