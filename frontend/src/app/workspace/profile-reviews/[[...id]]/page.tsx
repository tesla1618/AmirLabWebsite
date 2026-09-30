import type { Metadata } from "next";
import { WorkspacePageShell } from "@/components/workspace-page-shell";
import { ProfileReviewQueue } from "@/components/profile-review-queue";

export const metadata: Metadata = { title: "Profile reviews" };

/** `/workspace/profile-reviews` and `/…/{id}` are one master/detail page. */
export default function ProfileReviewsPage() {
  return (
    <WorkspacePageShell>
      <ProfileReviewQueue />
    </WorkspacePageShell>
  );
}
