import type { Metadata } from "next";
import { WorkspacePageShell } from "@/components/workspace-page-shell";
import { BackupSettings } from "@/components/backup-settings";
export const metadata: Metadata = { title: "Backup & restore" };
export default function BackupPage() {
  return (
    <WorkspacePageShell>
      <BackupSettings />
    </WorkspacePageShell>
  );
}
