import type { Metadata } from "next";
import { PositionAdminList } from "@/components/position-admin";
import { WorkspacePageShell } from "@/components/workspace-page-shell";
import { ButtonLink } from "@/components/ui/button-control";
import { Plus } from "lucide-react";

export const metadata: Metadata = { title: "Job posts" };

export default function PositionsPage() {
  return (
    <WorkspacePageShell
      action={
        <ButtonLink href="/workspace/positions/new" variant="primary">
          <Plus aria-hidden="true" size={16} /> Create job post
        </ButtonLink>
      }
      description="Manage open roles, publication state, and incoming applications."
    >
      <PositionAdminList />
    </WorkspacePageShell>
  );
}
