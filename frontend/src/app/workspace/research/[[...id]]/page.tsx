import { WorkspacePageShell } from "@/components/workspace-page-shell";
import { ResearchReviewQueue } from "@/components/research-review-queue";

/** `/workspace/research` and `/workspace/research/{id}` are one review page. */
export default function ResearchReviewPage() {
  return (
    <WorkspacePageShell>
      <ResearchReviewQueue />
    </WorkspacePageShell>
  );
}
