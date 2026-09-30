"use client";

import { cn } from "@/lib/cn";
import { loadingPlaceholder } from "@/lib/loading-style";
import { useDeferredValue, useEffect, useState } from "react";
import { ApiRequestError, apiRequest } from "@/lib/client-api";
import type { PaginatedResponse, ProfileEditRequest } from "@/lib/types";
import { profileValuesEqual } from "@/lib/profile-changes";
import { PaginationControls } from "@/components/pagination-controls";
import { StatePanel } from "@/components/state-panel";
import { DataTableShell } from "@/components/ui/data-table";
import { ToolbarSearchField } from "@/components/ui/toolbar-search-field";
import { SelectControl } from "@/components/ui/select-control";
import { FormField } from "@/components/ui/form-field";
import { ButtonControl } from "@/components/ui/button-control";
import { CheckboxControl } from "@/components/ui/checkbox-control";
import { BulkReviewBar } from "@/components/bulk-review-bar";
import { useBulkSelection } from "@/lib/use-bulk-selection";
import { useNotifications } from "@/components/notification-provider";
import {
  ReviewIssueStamp,
  SemanticStatus,
} from "@/components/ui/semantic-status";
import type { ReviewIssue } from "@/lib/review-issues";
import {
  ReviewSplit,
  WorkspaceRuleBand,
} from "@/components/ui/workspace-surface";
import { ProfileReviewDetail } from "@/components/profile-review-detail";
import { useReviewSelection } from "@/lib/use-review-selection";

export function ProfileReviewQueue() {
  const { refreshUnreadCount } = useNotifications();
  const [result, setResult] = useState<PaginatedResponse<ProfileEditRequest>>();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [sort, setSort] = useState("OLDEST");
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [reload, setReload] = useState(0);
  const [actionIssues, setActionIssues] = useState<
    Record<string, ReviewIssue[]>
  >({});

  useEffect(() => {
    let active = true;
    const params = new URLSearchParams({
      page: String(page),
      pageSize: "10",
      sort,
    });
    if (deferredSearch.trim()) params.set("search", deferredSearch.trim());
    void apiRequest<PaginatedResponse<ProfileEditRequest>>(
      `/profile-reviews?${params}`,
      { method: "GET" },
    )
      .then((response) => {
        if (!active) return;
        setResult(response);
        setActionIssues({});
        setError(undefined);
      })
      .catch((caught: unknown) => {
        if (active) {
          setError(
            caught instanceof Error ? caught.message : "Unable to load queue.",
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [deferredSearch, page, reload, sort]);

  const bulk = useBulkSelection((result?.items ?? []).map(({ id }) => id));
  const selectedRequests = (result?.items ?? []).filter(({ id }) =>
    bulk.isSelected(id),
  );
  const items = result?.items ?? [];
  const initialLoading = loading && !result;
  const { selectedId, select } = useReviewSelection(
    "/workspace/profile-reviews",
    {
      firstId: items[0]?.id,
      ready: !loading,
      viewKey: `${page}|${deferredSearch}|${sort}`,
    },
  );
  const outsideQueue = Boolean(
    selectedId && result && !items.some(({ id }) => id === selectedId),
  );

  function openNextAfterDecision() {
    const index = items.findIndex(({ id }) => id === selectedId);
    const next =
      index >= 0 ? (items[index + 1] ?? items[index - 1]) : undefined;
    select(next?.id);
    setLoading(true);
    if (items.length === 1 && page > 1) setPage((current) => current - 1);
    else setReload((current) => current + 1);
  }

  const issuesFor = (request: ProfileEditRequest) => [
    ...(request.reviewIssues ?? []),
    ...(actionIssues[request.id] ?? []),
  ];
  const selectedAttentionCount = selectedRequests.filter(
    (request) => issuesFor(request).length > 0,
  ).length;
  const selectedCanApprove = selectedRequests.every(
    (request) =>
      !issuesFor(request).some(({ tone }) => (tone ?? "error") === "error"),
  );
  const commonBulkActions =
    selectedRequests.length &&
    selectedRequests.every(({ status }) => status === "NEEDS_REVIEW")
      ? [
          ...(selectedCanApprove
            ? [
                {
                  confirmDescription: `Approve the ${selectedRequests.length} selected profile change request${selectedRequests.length === 1 ? "" : "s"}. Each request is guarded by its current revision.`,
                  confirmLabel: "Approve selected",
                  confirmTitle: "Approve selected profile changes?",
                  label: "Approve selected",
                  status: "APPROVED" as const,
                  tone: "primary" as const,
                },
              ]
            : []),
          {
            confirmDescription: `Reject the ${selectedRequests.length} selected profile change request${selectedRequests.length === 1 ? "" : "s"} with the same reviewer note.`,
            confirmLabel: "Reject selected",
            confirmTitle: "Reject selected profile changes?",
            label: "Reject selected",
            notePlaceholder: "Explain what these members need to fix.",
            requiresNote: true,
            status: "REJECTED" as const,
            tone: "danger" as const,
          },
        ]
      : [];

  function captureReviewError(error: ApiRequestError) {
    if (!error.issues.length) return;
    setActionIssues((current) => {
      const next = { ...current };
      const grouped = new Map<string, ReviewIssue[]>();
      for (const issue of error.issues) {
        if (!issue.itemId) continue;
        grouped.set(issue.itemId, [
          ...(grouped.get(issue.itemId) ?? []),
          issue,
        ]);
      }
      for (const [itemId, issues] of grouped) next[itemId] = issues;
      return next;
    });
  }

  function clearActionIssues() {
    setActionIssues({});
  }

  async function decideBulk({
    note,
    status,
  }: {
    note?: string;
    status: "APPROVED" | "REJECTED";
  }) {
    if (!selectedRequests.length) return;
    await apiRequest("/profile-reviews/bulk-review", {
      body: JSON.stringify({
        items: selectedRequests.map(({ id, revision }) => ({ id, revision })),
        ...(note ? { note } : {}),
        status,
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    bulk.clear();
    select(undefined);
    setLoading(true);
    if (selectedRequests.length === (result?.items.length ?? 0) && page > 1)
      setPage((current) => current - 1);
    else setReload((current) => current + 1);
    void refreshUnreadCount().catch(() => undefined);
  }

  const filtered = Boolean(search);
  const clear = () => {
    setLoading(true);
    setSearch("");
    setPage(1);
  };

  return (
    <DataTableShell>
      <WorkspaceRuleBand contentClassName="grid min-w-0 grid-cols-[minmax(220px,1fr)_minmax(160px,.7fr)_auto] items-end gap-[.8rem] px-[var(--workspace-gutter)] py-3.5 max-[760px]:grid-cols-1 max-[640px]:px-4">
        <ToolbarSearchField
          id="profile-review-search"
          label="Search"
          onChange={(event) => {
            setLoading(true);
            setSearch(event.target.value);
            setPage(1);
          }}
          placeholder="Name"
          value={search}
        />
        <FormField htmlFor="profile-review-sort" label="Sort">
          <SelectControl
            id="profile-review-sort"
            onValueChange={(value) => {
              setLoading(true);
              setSort(value);
              setPage(1);
            }}
            options={[
              { label: "Oldest first", value: "OLDEST" },
              { label: "Newest first", value: "NEWEST" },
              { label: "Name A-Z", value: "NAME" },
            ]}
            value={sort}
          />
        </FormField>
        <ButtonControl disabled={!filtered} onClick={clear} variant="secondary">
          Clear
        </ButtonControl>
      </WorkspaceRuleBand>

      {loading || result?.items.length ? (
        <BulkReviewBar
          actions={commonBulkActions}
          attentionCount={selectedAttentionCount}
          loading={loading}
          onClear={bulk.clear}
          onSelectAll={bulk.toggleAll}
          onError={captureReviewError}
          onSubmit={decideBulk}
          onSuccess={clearActionIssues}
          selectAllState={bulk.selectAllState}
          selectableCount={result?.items.length ?? 0}
          selectedCount={bulk.selectedCount}
          successBody={(status) =>
            `${selectedRequests.length} profile review${selectedRequests.length === 1 ? "" : "s"} ${status === "APPROVED" ? "approved" : "rejected"}.`
          }
          successTitle="Bulk profile review saved"
        />
      ) : null}

      {error && result ? (
        <p className="m-0 flex items-center gap-[.45rem] text-[.82rem] leading-[1.5] text-ink-muted rounded-panel bg-danger-soft p-[.8rem] text-danger">
          {error}
        </p>
      ) : null}
      {error && !result ? (
        <StatePanel
          frame="workspace"
          action={{
            label: "Retry",
            onClick: () => {
              setLoading(true);
              setReload((value) => value + 1);
            },
          }}
          body="The connection dropped. Reload to reconnect without losing review data."
          title="Could not load profile edits"
          variant="error"
        />
      ) : loading || result?.items.length ? (
        <ReviewSplit
          detail={
            <>
              {outsideQueue ? (
                <p className="m-0 font-mono text-[.62rem] tracking-[.08em] text-ink-muted uppercase">
                  Opened from a link · not in the current queue view
                </p>
              ) : null}
              <ProfileReviewDetail
                id={selectedId}
                key={selectedId ?? "loading"}
                onDecided={openNextAfterDecision}
              />
            </>
          }
          dimQueue={loading && Boolean(result)}
          queue={
            <>
              <div className="grid min-w-0 gap-3 border-b border-line px-[var(--workspace-gutter)] py-4">
                <p className="m-0 font-[var(--font-sans)] text-[.75rem] font-extrabold tracking-[.12em] text-brand uppercase">
                  Review queue
                </p>
                <PaginationControls
                  loading={loading}
                  onPageChange={(nextPage) => {
                    setLoading(true);
                    setPage(nextPage);
                  }}
                  page={page}
                  pageSize={result?.pageSize ?? 10}
                  total={result?.total}
                  totalPages={result?.totalPages ?? 1}
                />
              </div>
              <div data-loading={initialLoading || undefined}>
                {(initialLoading
                  ? Array.from({ length: 5 }, () => undefined)
                  : items
                ).map((request, row) => (
                  <ProfileQueueRow
                    checked={request ? bulk.isSelected(request.id) : false}
                    issues={request ? issuesFor(request) : []}
                    key={request?.id ?? `profile-review-loading-${row}`}
                    onCheckedChange={(checked) =>
                      request && bulk.toggle(request.id, checked)
                    }
                    onSelect={() => request && select(request.id)}
                    request={request}
                    selected={Boolean(request && request.id === selectedId)}
                  />
                ))}
              </div>
            </>
          }
        />
      ) : (
        <StatePanel
          frame="workspace"
          action={
            filtered ? { label: "Clear search", onClick: clear } : undefined
          }
          body={
            filtered
              ? "Try another name or clear the search."
              : "New member profile changes will appear here when submitted."
          }
          title={
            filtered
              ? "No matching profile edits"
              : "The profile review queue is clear"
          }
          variant={filtered ? "filtered" : "empty"}
        />
      )}
    </DataTableShell>
  );
}

function ProfileQueueRow({
  checked,
  issues,
  onCheckedChange,
  onSelect,
  request,
  selected,
}: {
  checked: boolean;
  issues: ReviewIssue[];
  onCheckedChange: (checked: boolean) => void;
  onSelect: () => void;
  request?: ProfileEditRequest;
  selected: boolean;
}) {
  const loading = !request;
  const issue = reviewIssue(issues);
  return (
    <div
      className={cn(
        "relative grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-stretch border-b border-line transition-colors last:border-b-0",
        selected ? "bg-brand-soft" : "hover:bg-surface-subtle",
      )}
    >
      <div className="grid place-items-center pr-2 pl-[var(--workspace-gutter)]">
        {request ? (
          <CheckboxControl
            ariaLabel={`Select ${request.person.fullName} profile review`}
            checked={checked}
            className="gap-0"
            id={`profile-review-select-${request.id}`}
            onCheckedChange={onCheckedChange}
          />
        ) : (
          <span
            className={loadingPlaceholder(true, "control")}
            data-placeholder="control"
          />
        )}
      </div>
      <button
        aria-current={selected || undefined}
        className="grid min-w-0 cursor-pointer gap-[.3rem] border-0 bg-transparent py-3.5 pr-10 text-left disabled:cursor-default"
        disabled={loading}
        onClick={onSelect}
        type="button"
      >
        <strong
          className={cn(
            "block truncate text-[.86rem] font-medium",
            loadingPlaceholder(loading, "text", "long"),
          )}
          data-placeholder="text"
          data-placeholder-width="long"
        >
          {request?.person.fullName ?? "Loading member"}
        </strong>
        <span
          className={cn(
            "font-mono text-[.64rem] text-ink-muted",
            loadingPlaceholder(loading, "label", "medium"),
          )}
          data-placeholder="label"
          data-placeholder-width="medium"
        >
          {request
            ? `${profileChangeCount(request)} fields · ${new Date(request.submittedAt).toLocaleDateString()}`
            : "0 fields · loading date"}
        </span>
        {issue ? (
          <SemanticStatus tone={issue.tone ?? "error"}>
            {issue.message}
          </SemanticStatus>
        ) : null}
      </button>
      {request ? (
        <ReviewIssueStamp className="top-2 right-2" issue={issues[0]} />
      ) : null}
    </div>
  );
}

function reviewIssue(issues: ReviewIssue[]): ReviewIssue | undefined {
  return issues[0];
}

function profileChangeCount(request: ProfileEditRequest): number {
  const current = request.person;
  const proposed = request.payload;
  const values = [
    [current.fullName, proposed.fullName],
    [current.headline, proposed.headline],
    [current.biography, proposed.biography],
    [current.phone, proposed.phone],
    [current.contactAddress, proposed.contactAddress],
    [current.expertise, proposed.expertise],
    [
      (current.links ?? []).map(({ label, type, url }) => ({
        label,
        type,
        url,
      })),
      proposed.links,
    ],
    [
      (current.profileSections ?? []).map(
        ({ content, subsections, title, type }) => ({
          subsections: subsections?.length
            ? subsections
            : content
              ? [{ heading: null, entries: [{ label: null, content }] }]
              : [],
          title,
          type,
        }),
      ),
      proposed.sections,
    ],
  ];
  const fieldChanges = values.filter(
    ([before, after]) => !profileValuesEqual(before, after),
  ).length;
  const proposedAvatar = proposed.removeAvatar
    ? null
    : (request.avatarAsset?.id ?? current.avatar?.id);
  return fieldChanges + Number(current.avatar?.id !== proposedAvatar);
}
