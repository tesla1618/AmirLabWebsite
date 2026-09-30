"use client";

import { ReviewActions, type ReviewAction } from "@/components/review-actions";
import { ButtonControl } from "@/components/ui/button-control";
import { CheckboxControl } from "@/components/ui/checkbox-control";
import { useId } from "react";
import type { ApiRequestError } from "@/lib/client-api";
import { SemanticStatus } from "@/components/ui/semantic-status";
import { WorkspaceRuleBand } from "@/components/ui/workspace-surface";

export function BulkReviewBar<Status extends string>({
  actions,
  attentionCount = 0,
  loading = false,
  onClear,
  onSelectAll,
  onError,
  onSubmit,
  onSuccess,
  selectAllState,
  selectedCount,
  selectableCount,
  successBody,
  successTitle,
}: {
  actions: Array<ReviewAction<Status>>;
  attentionCount?: number;
  loading?: boolean;
  onClear: () => void;
  onSelectAll: (checked: boolean) => void;
  onError?: (error: ApiRequestError) => void;
  onSubmit: (decision: { note?: string; status: Status }) => Promise<void>;
  onSuccess?: (status: Status) => void;
  selectAllState: boolean | "indeterminate";
  selectedCount: number;
  selectableCount: number;
  successBody: (status: Status) => string;
  successTitle: string;
}) {
  const selectAllId = useId();
  if (!selectableCount && !loading) return null;

  return (
    <WorkspaceRuleBand
      aria-label="Bulk review actions"
      contentClassName="grid min-w-0 grid-cols-[minmax(160px,auto)_minmax(0,1fr)] items-center gap-4 px-[var(--workspace-gutter)] py-3 max-[720px]:grid-cols-1 max-[640px]:px-4"
    >
      <div className="flex min-w-0 flex-wrap items-center gap-3">
        <CheckboxControl
          checked={selectAllState}
          disabled={loading || selectableCount === 0}
          id={selectAllId}
          onCheckedChange={onSelectAll}
        >
          Select all{selectableCount ? ` ${selectableCount}` : ""}
        </CheckboxControl>
        <span className="font-mono text-[.68rem] uppercase tracking-[.05em] text-ink-muted">
          {selectedCount ? `${selectedCount} selected` : "No selection"}
        </span>
        {attentionCount ? (
          <SemanticStatus tone="warning">
            {attentionCount} need{attentionCount === 1 ? "s" : ""} attention
          </SemanticStatus>
        ) : null}
      </div>
      <div className="flex min-w-0 flex-wrap items-center justify-end gap-3 max-[720px]:justify-start">
        {selectedCount && actions.length ? (
          <ReviewActions
            actions={actions}
            className="compact min-w-0"
            loading={loading}
            onError={onError}
            onSubmit={onSubmit}
            onSuccess={onSuccess}
            successBody={successBody}
            successTitle={successTitle}
          />
        ) : selectedCount ? (
          <span className="text-[.78rem] leading-[1.45] text-ink-muted">
            No common action is available for this selection.
          </span>
        ) : (
          <span className="text-[.78rem] leading-[1.45] text-ink-muted">
            Select review items to act on them together.
          </span>
        )}
        {selectedCount ? (
          <ButtonControl
            compact
            disabled={loading}
            onClick={onClear}
            variant="ghost"
          >
            Clear selection
          </ButtonControl>
        ) : null}
      </div>
    </WorkspaceRuleBand>
  );
}
