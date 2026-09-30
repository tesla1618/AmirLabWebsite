"use client";

import { cn } from "@/lib/cn";
import { loadingPlaceholder } from "@/lib/loading-style";
import { useEffect, useState } from "react";
import { StatePanel } from "@/components/state-panel";
import { Badge } from "@/components/ui/badge";
import { ButtonAnchor } from "@/components/ui/button-control";
import { ReviewActions } from "@/components/review-actions";
import { BulkReviewBar } from "@/components/bulk-review-bar";
import { CheckboxControl } from "@/components/ui/checkbox-control";
import { useBulkSelection } from "@/lib/use-bulk-selection";
import { ApiRequestError, apiRequest } from "@/lib/client-api";
import { useReviewIssues } from "@/lib/use-review-issues";
import {
  WorkspaceCollection,
  WorkspaceHero,
  WorkspaceRow,
} from "@/components/ui/workspace-surface";
import { useNotifications } from "@/components/notification-provider";
import type { ReviewIssue } from "@/lib/review-issues";
import {
  ReviewIssueStamp,
  SemanticStatus,
} from "@/components/ui/semantic-status";

interface ChangeRequest {
  id: string;
  projectId: string;
  kind: string;
  payload: unknown;
  submittedAt: string;
  submittedBy: { email: string | null; person: { fullName: string } | null };
  project: { researchItem: { title: string | null } };
  reviewIssues?: ReviewIssue[];
}

export function ProjectReviewQueue() {
  const { refreshUnreadCount } = useNotifications();
  const [items, setItems] = useState<ChangeRequest[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const reviewIssues = useReviewIssues();
  const loaded = !loading && !error;

  function load() {
    setLoading(true);
    return apiRequest<ChangeRequest[]>("/project-change-reviews", {
      method: "GET",
    })
      .then((nextItems) => {
        setItems(nextItems);
        reviewIssues.clear();
        setError("");
        return true;
      })
      .catch((value: Error) => {
        setError(value.message);
        return false;
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    let active = true;
    void apiRequest<ChangeRequest[]>("/project-change-reviews", {
      method: "GET",
    })
      .then((nextItems) => {
        if (active) setItems(nextItems);
      })
      .catch((value: Error) => {
        if (active) setError(value.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  function captureItemError(itemId: string, error: ApiRequestError) {
    if (error.issues.length) reviewIssues.capture(error);
    else
      reviewIssues.setOne(itemId, {
        code: "PROJECT_REVIEW_FAILED",
        message: "This project change decision could not be saved.",
        tone: "error",
      });
  }

  async function decide(
    id: string,
    { note, status }: { note?: string; status: "APPROVED" | "REJECTED" },
  ) {
    await apiRequest(`/project-change-reviews/${id}/review`, {
      body: JSON.stringify({ ...(note ? { note } : {}), status }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    if (!(await load())) {
      setError(
        "The review decision was saved, but the queue could not refresh.",
      );
    }
    void refreshUnreadCount().catch(() => undefined);
  }

  const bulk = useBulkSelection(items.map(({ id }) => id));
  const selectedItems = items.filter(({ id }) => bulk.isSelected(id));
  const selectedProjectCounts = selectedItems.reduce((counts, item) => {
    counts.set(item.projectId, (counts.get(item.projectId) ?? 0) + 1);
    return counts;
  }, new Map<string, number>());
  const hasDuplicateProjects = [...selectedProjectCounts.values()].some(
    (count) => count > 1,
  );
  const itemReviewIssues = (item: ChangeRequest): ReviewIssue[] => [
    ...(item.reviewIssues ?? []),
    ...reviewIssues.forItem(item.id),
  ];
  const issuesFor = (item: ChangeRequest): ReviewIssue[] => [
    ...itemReviewIssues(item),
    ...((selectedProjectCounts.get(item.projectId) ?? 0) > 1
      ? [
          {
            code: "MULTIPLE_CHANGES_FOR_PROJECT",
            itemId: item.id,
            message: "Another selected change belongs to the same project.",
            tone: "warning" as const,
          },
        ]
      : []),
  ];
  const selectedAttentionCount = selectedItems.filter(
    (item) => issuesFor(item).length > 0,
  ).length;
  const selectedCanApprove = selectedItems.every(
    (item) => issuesFor(item).length === 0,
  );
  const commonBulkActions = selectedItems.length
    ? [
        ...(selectedCanApprove && !hasDuplicateProjects
          ? [
              {
                confirmDescription: `Apply and publish the ${selectedItems.length} selected project change${selectedItems.length === 1 ? "" : "s"}. Version guards still apply to every request.`,
                confirmLabel: "Approve selected",
                confirmTitle: "Approve selected project changes?",
                label: "Approve selected",
                status: "APPROVED" as const,
                tone: "primary" as const,
              },
            ]
          : []),
        {
          confirmDescription: `Reject the ${selectedItems.length} selected project change${selectedItems.length === 1 ? "" : "s"} with the same reviewer note.`,
          confirmLabel: "Reject selected",
          confirmTitle: "Reject selected project changes?",
          label: "Reject selected",
          notePlaceholder: "Explain why these project changes were rejected.",
          requiresNote: true,
          status: "REJECTED" as const,
          tone: "danger" as const,
        },
      ]
    : [];

  async function decideBulk({
    note,
    status,
  }: {
    note?: string;
    status: "APPROVED" | "REJECTED";
  }) {
    if (!selectedItems.length) return;
    await apiRequest("/project-change-reviews/bulk-review", {
      body: JSON.stringify({
        ids: selectedItems.map(({ id }) => id),
        ...(note ? { note } : {}),
        status,
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    bulk.clear();
    if (!(await load())) {
      setError(
        "The review decisions were saved, but the queue could not refresh.",
      );
    }
    void refreshUnreadCount().catch(() => undefined);
  }

  return (
    <section className="grid min-w-0 gap-4">
      <WorkspaceHero
        action={
          <Badge loading={loading}>
            {loading ? "Loading" : `${items.length} pending`}
          </Badge>
        }
        description="Review member-submitted changes to milestones, team records, outputs, resources, and project settings before they publish."
        eyebrow="Review queue"
        title="Project change moderation"
      />

      {loading || items.length ? (
        <BulkReviewBar
          actions={commonBulkActions}
          attentionCount={selectedAttentionCount}
          loading={loading}
          onClear={bulk.clear}
          onSelectAll={bulk.toggleAll}
          onError={reviewIssues.capture}
          onSubmit={decideBulk}
          onSuccess={reviewIssues.clear}
          selectAllState={bulk.selectAllState}
          selectableCount={items.length}
          selectedCount={bulk.selectedCount}
          successBody={(status) =>
            `${selectedItems.length} project review${selectedItems.length === 1 ? "" : "s"} ${status === "APPROVED" ? "approved" : "rejected"}.`
          }
          successTitle="Bulk project review saved"
        />
      ) : null}

      {error && items.length ? (
        <p className="m-0 flex items-center gap-[.45rem] text-[.82rem] leading-[1.5] text-ink-muted rounded-panel bg-danger-soft p-[.8rem] text-danger">
          {error}
        </p>
      ) : null}

      <WorkspaceCollection data-loading={loading || undefined}>
        {error && !items.length && !loading ? (
          <StatePanel
            action={{ label: "Retry", onClick: () => void load() }}
            body="The connection dropped. Nothing was lost; reconnect to continue."
            title="Could not load project changes"
            variant="error"
          />
        ) : null}

        {loading || loaded
          ? (loading && !items.length
              ? Array.from({ length: 4 }, () => undefined)
              : items
            ).map((item, index) => (
              <WorkspaceRow
                className="relative grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-4 bg-transparent p-[clamp(1rem,2vw,1.4rem)] pr-10 max-[720px]:grid-cols-[auto_minmax(0,1fr)]"
                key={item?.id ?? `project-review-loading-${index}`}
              >
                {item ? <ReviewIssueStamp issue={issuesFor(item)[0]} /> : null}
                <div className="pt-1">
                  {item ? (
                    <CheckboxControl
                      ariaLabel={`Select ${item.project.researchItem.title ?? "project"} change review`}
                      checked={bulk.isSelected(item.id)}
                      className="gap-0"
                      id={`project-review-select-${item.id}`}
                      onCheckedChange={(checked) =>
                        bulk.toggle(item.id, checked)
                      }
                    />
                  ) : (
                    <span
                      className={loadingPlaceholder(true, "control")}
                      data-placeholder="control"
                    />
                  )}
                </div>
                <div className="grid min-w-0 gap-[.55rem]">
                  <span
                    className={cn(
                      "font-mono text-[.68rem] uppercase tracking-[.08em] text-brand",
                      loadingPlaceholder(loading, "label", "medium"),
                    )}
                    data-placeholder="label"
                    data-placeholder-width="medium"
                  >
                    {item?.kind.replaceAll("_", " ") ?? "Loading change type"}
                  </span>
                  <h2
                    className={cn(
                      "font-sans text-[clamp(1.35rem,2.4vw,2.1rem)] font-[430] leading-[1.08] [overflow-wrap:anywhere]",
                      loadingPlaceholder(loading, "text", "long"),
                    )}
                    data-placeholder="text"
                    data-placeholder-width="long"
                  >
                    {item?.project.researchItem.title ??
                      "Loading project title"}
                  </h2>
                  <p
                    className={cn(
                      "m-0 text-[.86rem] text-ink-muted",
                      loadingPlaceholder(loading, "text", "full"),
                    )}
                    data-placeholder="text"
                    data-placeholder-width="full"
                  >
                    {item ? (
                      <>
                        Submitted by{" "}
                        {item.submittedBy.person?.fullName ??
                          item.submittedBy.email ??
                          "member"}{" "}
                        · {new Date(item.submittedAt).toLocaleString()}
                      </>
                    ) : (
                      "Loading submission provenance"
                    )}
                  </p>
                  {item && issuesFor(item)[0] ? (
                    <SemanticStatus
                      loading={loading}
                      tone={issuesFor(item)[0].tone ?? "warning"}
                    >
                      {issuesFor(item)[0].message}
                    </SemanticStatus>
                  ) : null}
                  <section
                    className="mt-[.4rem] grid gap-3 border-t border-line pt-[.8rem]"
                    aria-label="Proposed project changes"
                  >
                    <h3
                      className={cn(
                        "text-[.82rem] font-[750]",
                        loadingPlaceholder(loading, "label"),
                      )}
                      data-placeholder={loading ? "label" : undefined}
                    >
                      Proposed changes
                    </h3>
                    {item ? (
                      <ProjectChangePreview
                        kind={item.kind}
                        loading={loading}
                        payload={item.payload}
                      />
                    ) : (
                      <div
                        className={loadingPlaceholder(true, "text", "full")}
                        data-placeholder="text"
                        data-placeholder-width="full"
                      >
                        Loading proposed changes
                      </div>
                    )}
                  </section>
                </div>
                <ReviewActions
                  className="max-[720px]:col-span-2"
                  loading={loading}
                  actions={[
                    {
                      confirmDescription:
                        "Apply this project change and publish it to the workspace record.",
                      confirmLabel: "Approve change",
                      confirmTitle: "Approve this project change?",
                      disabled: Boolean(item && itemReviewIssues(item).length),
                      label:
                        item && itemReviewIssues(item).length
                          ? "Needs attention"
                          : "Approve",
                      status: "APPROVED",
                      tone: "primary",
                    },
                    {
                      confirmDescription:
                        "Reject this project change and show the reviewer note to the submitting member.",
                      confirmLabel: "Reject change",
                      confirmTitle: "Reject this project change?",
                      label: "Reject",
                      notePlaceholder:
                        "Explain why this project change was rejected.",
                      requiresNote: true,
                      status: "REJECTED",
                      tone: "danger",
                    },
                  ]}
                  onError={(requestError) =>
                    item && captureItemError(item.id, requestError)
                  }
                  onSubmit={(decision) =>
                    item ? decide(item.id, decision) : Promise.resolve()
                  }
                  onSuccess={() => item && reviewIssues.clearOne(item.id)}
                  successBody={(status) =>
                    `The project change was ${status.toLowerCase()}.`
                  }
                  successTitle="Project review saved"
                />
              </WorkspaceRow>
            ))
          : null}

        {loaded && !items.length ? (
          <StatePanel
            action={{ href: "/workspace/projects", label: "View projects" }}
            body="Project edits that require manual review will appear here. Automatic project changes continue to publish directly based on the current policy."
            title="Project change queue is clear"
            variant="empty"
          />
        ) : null}
      </WorkspaceCollection>
    </section>
  );
}

function ProjectChangePreview({
  kind,
  payload,
  loading = false,
}: {
  kind: string;
  payload: unknown;
  loading?: boolean;
}) {
  const record = asRecord(payload);
  const entries = Object.entries(record).filter(
    ([key]) => key !== "publishNow" && key !== "overrideReason",
  );

  if (kind === "ARCHIVE") {
    return (
      <div className="border border-danger/25 bg-danger-soft p-4 text-[.82rem] leading-[1.55] text-danger">
        Archive this project and remove its public project page.
      </div>
    );
  }

  if (!entries.length) {
    return (
      <p className="m-0 text-[.8rem] text-ink-muted">
        No additional values were submitted with this change.
      </p>
    );
  }

  return (
    <dl className="grid grid-cols-2 gap-x-5 gap-y-3 rounded-panel bg-surface-subtle p-4 max-[700px]:grid-cols-1">
      {entries.map(([key, value]) => (
        <ProjectChangeField
          key={key}
          label={humanizeKey(key)}
          loading={loading}
          value={value}
        />
      ))}
    </dl>
  );
}

function ProjectChangeField({
  label,
  value,
  loading = false,
}: {
  label: string;
  value: unknown;
  loading?: boolean;
}) {
  if (Array.isArray(value)) {
    return (
      <div className="col-span-full grid gap-2 border-t border-line pt-3 first:border-t-0 first:pt-0">
        <dt className="font-mono text-[.62rem] font-semibold uppercase tracking-[.07em] text-ink-muted">
          {label}
        </dt>
        <dd className="m-0 grid gap-2">
          {value.length ? (
            value.map((entry, index) => (
              <ProjectChangeListEntry
                entry={entry}
                index={index}
                key={index}
                loading={loading}
              />
            ))
          ) : (
            <span
              className={cn(
                "text-[.78rem] text-ink-muted",
                loadingPlaceholder(loading, "text", "short"),
              )}
              data-placeholder={loading ? "text" : undefined}
              data-placeholder-width="short"
            >
              None
            </span>
          )}
        </dd>
      </div>
    );
  }

  return (
    <div className="grid min-w-0 content-start gap-1 border-t border-line pt-3 first:border-t-0 first:pt-0">
      <dt className="font-mono text-[.62rem] font-semibold uppercase tracking-[.07em] text-ink-muted">
        {label}
      </dt>
      <dd
        className={cn(
          "m-0 min-w-0 text-[.82rem] leading-[1.5] [overflow-wrap:anywhere]",
          loadingPlaceholder(loading, "text", "long"),
        )}
        data-placeholder={loading ? "text" : undefined}
        data-placeholder-width="long"
      >
        {renderProjectChangeValue(value, loading)}
      </dd>
    </div>
  );
}

function ProjectChangeListEntry({
  entry,
  index,
  loading = false,
}: {
  entry: unknown;
  index: number;
  loading?: boolean;
}) {
  if (!entry || Array.isArray(entry) || typeof entry !== "object") {
    return (
      <div className="rounded-control border border-line bg-surface px-3 py-2 text-[.78rem]">
        {renderProjectChangeValue(entry, loading)}
      </div>
    );
  }
  const record = entry as Record<string, unknown>;
  const heading =
    stringValue(record.title) ??
    stringValue(record.label) ??
    `Item ${index + 1}`;
  const entries = Object.entries(record).filter(
    ([key]) => key !== "title" && key !== "label" && key !== "id",
  );
  return (
    <article className="grid gap-2 rounded-control border border-line bg-surface p-3">
      <strong
        className={cn(
          "text-[.84rem]",
          loadingPlaceholder(loading, "text", "long"),
        )}
        data-placeholder={loading ? "text" : undefined}
        data-placeholder-width="long"
      >
        {heading}
      </strong>
      {entries.length ? (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 max-[640px]:grid-cols-1">
          {entries.map(([key, value]) => (
            <div className="grid gap-[.15rem]" key={key}>
              <dt className="font-mono text-[.58rem] uppercase tracking-[.05em] text-ink-muted">
                {humanizeKey(key)}
              </dt>
              <dd
                className={cn(
                  "m-0 text-[.76rem] leading-[1.45] [overflow-wrap:anywhere]",
                  loadingPlaceholder(loading, "text", "long"),
                )}
                data-placeholder={loading ? "text" : undefined}
                data-placeholder-width="long"
              >
                {renderProjectChangeValue(value, loading)}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}
    </article>
  );
}

function renderProjectChangeValue(value: unknown, loading: boolean = false) {
  if (value === null || value === undefined || value === "") {
    return <span className="text-ink-muted">Not set</span>;
  }
  if (typeof value === "boolean") {
    return (
      <Badge loading={loading} tone={value ? "success" : "neutral"}>
        {value ? "Enabled" : "Disabled"}
      </Badge>
    );
  }
  if (typeof value === "number") return String(value);
  if (typeof value === "string") {
    if (/^https?:\/\//i.test(value)) {
      return (
        <ButtonAnchor
          compact
          href={value}
          rel="noreferrer"
          target="_blank"
          variant="ghost"
        >
          Open link
        </ButtonAnchor>
      );
    }
    if (/^\d{4}-\d{2}-\d{2}(?:T|$)/.test(value)) {
      const date = new Date(value);
      if (!Number.isNaN(date.getTime())) return date.toLocaleString();
    }
    if (/^[A-Z][A-Z0-9_]+$/.test(value)) {
      return value.replaceAll("_", " ").toLowerCase();
    }
    return value;
  }
  if (Array.isArray(value))
    return `${value.length} item${value.length === 1 ? "" : "s"}`;
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    return entries.length
      ? entries
          .map(
            ([key, item]) =>
              `${humanizeKey(key)}: ${plainProjectChangeValue(item)}`,
          )
          .join(" · ")
      : "None";
  }
  return String(value);
}

function plainProjectChangeValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "Not set";
  if (typeof value === "boolean") return value ? "Enabled" : "Disabled";
  if (typeof value === "string" && /^[A-Z][A-Z0-9_]+$/.test(value))
    return value.replaceAll("_", " ").toLowerCase();
  if (Array.isArray(value))
    return `${value.length} item${value.length === 1 ? "" : "s"}`;
  return String(value);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && !Array.isArray(value) && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function humanizeKey(value: string): string {
  const spaced = value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replaceAll("_", " ")
    .trim();
  return spaced
    ? spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase()
    : value;
}
