"use client";
import { useEffect, useState } from "react";
import { AdminOnly } from "@/components/admin-only";
import { useAuth } from "@/components/auth-provider";
import { ButtonControl } from "@/components/ui/button-control";
import { SemanticStatus } from "@/components/ui/semantic-status";
import {
  WorkspaceHero,
  WorkspacePanel,
  WorkspaceSurface,
} from "@/components/ui/workspace-surface";
import { apiRequest } from "@/lib/client-api";
interface BackupStatus {
  configured: boolean;
  provider: string | null;
  canBackup: boolean;
  canRestore: boolean;
  lastBackup: { id: string; createdAt: string; verified: boolean } | null;
  reason: "STORAGE_NOT_CONFIGURED" | null;
}
export function BackupSettings() {
  const { user } = useAuth();
  const [status, setStatus] = useState<BackupStatus | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    if (user?.role !== "ADMIN") return;
    let active = true;
    void apiRequest<BackupStatus>("/backups/status", { method: "GET" })
      .then((value) => {
        if (active) setStatus(value);
      })
      .catch(() => {
        if (active) setError(true);
      });
    return () => {
      active = false;
    };
  }, [user?.role]);
  return (
    <AdminOnly>
      <WorkspaceSurface measure="form">
        <WorkspaceHero
          eyebrow="Administration"
          title="Backup & restore"
          description="Protect the database and uploaded files together."
        />
        <WorkspacePanel
          title="Backup storage"
          description="A storage provider has not been selected yet."
        >
          <div className="grid gap-4 p-4">
            <div role="status">
              <SemanticStatus tone={error ? "error" : "warning"}>
                {error
                  ? "Unable to check backup configuration. Reload and try again."
                  : status
                    ? "Storage not configured"
                    : "Checking backup configuration…"}
              </SemanticStatus>
            </div>
            <p className="text-xs leading-relaxed text-ink-muted">
              Backup and restore actions will become available after storage is
              configured. No automated backups are running through this
              interface.
            </p>
            <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-xs">
              <dt className="text-ink-muted">Storage provider</dt>
              <dd>{status?.provider ?? "Not selected"}</dd>
              <dt className="text-ink-muted">Last verified backup</dt>
              <dd>
                {status?.lastBackup
                  ? new Date(status.lastBackup.createdAt).toLocaleString()
                  : "None available"}
              </dd>
              <dt className="text-ink-muted">Schedule</dt>
              <dd>Not configured</dd>
            </dl>
          </div>
        </WorkspacePanel>
        <WorkspacePanel
          title="Create a backup"
          description="Include PostgreSQL records and uploaded files in one recoverable backup."
        >
          <div className="grid justify-items-start gap-3 p-4">
            <ButtonControl disabled>Create backup</ButtonControl>
            <p className="text-xs text-ink-muted">
              Configure storage before creating or downloading a backup.
            </p>
          </div>
        </WorkspacePanel>
        <WorkspacePanel
          title="Restore a backup"
          description="Verify a backup in an isolated environment before replacing live data."
        >
          <div className="grid justify-items-start gap-3 p-4">
            <ButtonControl disabled variant="danger-ghost">
              Select backup to restore
            </ButtonControl>
            <p className="text-xs text-ink-muted">
              Restore is unavailable until storage and recovery targets are
              configured.
            </p>
          </div>
        </WorkspacePanel>
      </WorkspaceSurface>
    </AdminOnly>
  );
}
