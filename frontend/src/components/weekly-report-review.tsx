"use client";

import { cn } from "@/lib/cn";
import { loadingPlaceholder } from "@/lib/loading-style";
import { useEffect, useState } from "react";
import { CheckCircle2, RotateCcw } from "lucide-react";
import { StatePanel } from "@/components/state-panel";
import { Badge } from "@/components/ui/badge";
import { ButtonControl } from "@/components/ui/button-control";
import { CheckboxControl } from "@/components/ui/checkbox-control";
import { BulkReviewBar } from "@/components/bulk-review-bar";
import { useBulkSelection } from "@/lib/use-bulk-selection";
import { TabsControl } from "@/components/ui/tabs-control";
import { TextareaControl } from "@/components/ui/form-controls";
import { FormField } from "@/components/ui/form-field";
import {
  WorkspaceEmpty,
  WorkspaceHero,
  WorkspacePanel,
  WorkspaceRuleBand,
  WorkspaceSurface,
} from "@/components/ui/workspace-surface";
import { ApiRequestError, apiRequest } from "@/lib/client-api";
import {
  reportStatusLabel,
  reportWeek,
  type WeeklyReport,
  type WeeklyReportStatus,
} from "@/lib/weekly-reports";
import { statusTone } from "./weekly-reports";
import { useReviewIssues } from "@/lib/use-review-issues";
import { useReviewSelection } from "@/lib/use-review-selection";
import {
  ReviewIssueStamp,
  SemanticStatus,
} from "@/components/ui/semantic-status";
import { useNotifications } from "@/components/notification-provider";

const filters = [
  { label: "Awaiting review", value: "SUBMITTED" },
  { label: "Changes requested", value: "CHANGES_REQUESTED" },
  { label: "Reviewed", value: "REVIEWED" },
];

export function WeeklyReportReview() {
  const { refreshUnreadCount, showToast } = useNotifications();
  const [reports, setReports] = useState<WeeklyReport[]>();
  // Unset until the reviewer picks a tab: a linked report opens on its tab.
  const [filterChoice, setFilter] = useState<WeeklyReportStatus>();
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [working, setWorking] = useState(false);
  const [reload, setReload] = useState(0);
  const reviewIssues = useReviewIssues();
  // With no report open, the chosen tab (default: awaiting review) supplies
  // the first record; a linked report instead picks its own tab below.
  const { selectedId, select } = useReviewSelection(
    "/workspace/weekly-reports/review",
    {
      firstId: reports?.find(
        ({ status }) => status === (filterChoice ?? "SUBMITTED"),
      )?.id,
      ready: Boolean(reports),
      viewKey: filterChoice ?? "",
    },
  );

  useEffect(() => {
    let active = true;
    apiRequest<WeeklyReport[]>("/weekly-reports/review-queue", {
      method: "GET",
    })
      .then((result) => {
        if (!active) return;
        setReports(result);
        setError("");
      })
      .catch((caught: unknown) => {
        if (active)
          setError(
            caught instanceof Error
              ? caught.message
              : "Weekly reports could not be loaded.",
          );
      });
    return () => {
      active = false;
    };
  }, [reload]);

  const selected = reports?.find(({ id }) => id === selectedId);
  const filter = filterChoice ?? selected?.status ?? "SUBMITTED";
  const visible = reports?.filter(({ status }) => status === filter) ?? [];
  const missing = Boolean(reports && selectedId && !selected);

  const bulk = useBulkSelection(visible.map(({ id }) => id));
  const selectedReports = visible.filter(({ id }) => bulk.isSelected(id));
  const selectedAttentionCount = selectedReports.filter(
    ({ id }) => reviewIssues.forItem(id).length > 0,
  ).length;
  const commonBulkActions =
    selectedReports.length &&
    selectedReports.every(
      ({ id, status }) =>
        status === "SUBMITTED" && reviewIssues.forItem(id).length === 0,
    )
      ? [
          {
            confirmDescription: `Return the ${selectedReports.length} selected weekly report${selectedReports.length === 1 ? "" : "s"} for changes with the same supervisor note.`,
            confirmLabel: "Request changes",
            confirmTitle: "Request changes for selected reports?",
            label: "Request changes",
            notePlaceholder: "Explain what these researchers must change.",
            requiresNote: true,
            status: "CHANGES_REQUESTED" as const,
            tone: "secondary" as const,
          },
          {
            confirmDescription: `Mark the ${selectedReports.length} selected weekly report${selectedReports.length === 1 ? "" : "s"} as reviewed.`,
            confirmLabel: "Mark reviewed",
            confirmTitle: "Mark selected reports reviewed?",
            label: "Mark reviewed",
            status: "REVIEWED" as const,
            tone: "primary" as const,
          },
        ]
      : [];
  const options = filters.map((option) => ({
    ...option,
    count: reports?.filter(({ status }) => status === option.value).length ?? 0,
  }));

  async function reviewBulk({
    note: bulkNote,
    status,
  }: {
    note?: string;
    status: "CHANGES_REQUESTED" | "REVIEWED";
  }) {
    if (!selectedReports.length) return;
    setWorking(true);
    try {
      await apiRequest("/weekly-reports/bulk-review", {
        body: JSON.stringify({
          ids: selectedReports.map(({ id }) => id),
          ...(bulkNote ? { note: bulkNote } : {}),
          status,
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      bulk.clear();
      select(undefined);
      setReload((current) => current + 1);
      void refreshUnreadCount().catch(() => undefined);
    } finally {
      setWorking(false);
    }
  }

  async function review(status: "CHANGES_REQUESTED" | "REVIEWED") {
    if (!selected) return;
    if (status === "CHANGES_REQUESTED" && !note.trim()) {
      setError("Explain what the researcher must change.");
      return;
    }
    setWorking(true);
    const index = visible.findIndex(({ id }) => id === selected.id);
    const next = visible[index + 1] ?? visible[index - 1];
    try {
      const updated = await apiRequest<WeeklyReport>(
        `/weekly-reports/${selected.id}/review`,
        {
          body: JSON.stringify({ note, status }),
          headers: { "content-type": "application/json" },
          method: "POST",
        },
      );
      setReports((current) =>
        current?.map((report) => (report.id === updated.id ? updated : report)),
      );
      setFilter(filter);
      select(next?.id);
      setNote(next?.reviewNote ?? "");
      setError("");
      reviewIssues.clearOne(selected.id);
      void refreshUnreadCount().catch(() => undefined);
    } catch (caught) {
      const requestError =
        caught instanceof ApiRequestError ? caught : undefined;
      if (requestError?.issues.length) reviewIssues.capture(requestError);
      else
        reviewIssues.setOne(selected.id, {
          code: "WEEKLY_REVIEW_FAILED",
          message: "This weekly report decision could not be saved.",
          tone: "error",
        });
      showToast({
        body:
          requestError?.message ??
          "The weekly report decision could not be saved.",
        title: "Weekly report review was not saved",
        tone: "error",
      });
    } finally {
      setWorking(false);
    }
  }

  return (
    <WorkspaceSurface measure="reading">
      <WorkspaceHero
        description="Review project-linked evidence, surface blockers, and return specific guidance without turning weekly reporting into a ranking contest."
        eyebrow="Review · research cadence"
        meta={
          <span>
            {reports?.filter(({ status }) => status === "SUBMITTED").length ??
              "—"}{" "}
            awaiting review
          </span>
        }
        title="Weekly report review"
      />

      {error ? (
        <StatePanel
          action={
            !reports
              ? {
                  label: "Try again",
                  onClick: () => setReload((value) => value + 1),
                }
              : undefined
          }
          body={error}
          title="Weekly report review needs attention"
          variant="error"
        />
      ) : null}

      <TabsControl
        ariaLabel="Filter weekly reports"
        onValueChange={(value) => {
          const status = value as WeeklyReportStatus;
          setFilter(status);
          select(reports?.find((report) => report.status === status)?.id);
          setNote("");
        }}
        options={options}
        value={filter}
      />

      <BulkReviewBar
        actions={commonBulkActions}
        attentionCount={selectedAttentionCount}
        loading={!reports || working}
        onClear={bulk.clear}
        onSelectAll={bulk.toggleAll}
        onError={reviewIssues.capture}
        onSubmit={reviewBulk}
        onSuccess={reviewIssues.clear}
        selectAllState={bulk.selectAllState}
        selectableCount={visible.length}
        selectedCount={bulk.selectedCount}
        successBody={(status) =>
          `${selectedReports.length} weekly report${selectedReports.length === 1 ? "" : "s"} moved to ${status.replaceAll("_", " ").toLowerCase()}.`
        }
        successTitle="Bulk weekly report review saved"
      />

      <WorkspaceRuleBand contentClassName="grid grid-cols-[minmax(0,1.22fr)_minmax(320px,.78fr)] !px-0 max-[900px]:grid-cols-1">
        <div className="min-w-0 [&>section]:border-0">
          <WorkspacePanel
            description="Select a report to inspect its evidence and plan."
            eyebrow="Queue"
            title={
              filters.find(({ value }) => value === filter)?.label ?? "Reports"
            }
          >
            <div
              aria-busy={!reports}
              className="grid"
              data-loading={!reports || undefined}
            >
              {(reports
                ? visible
                : Array.from({ length: 3 }, () => undefined)
              ).map((report, index) => (
                <div
                  className="relative grid grid-cols-[auto_minmax(0,1fr)] items-stretch border-b border-line last:border-b-0"
                  key={report?.id ?? `weekly-review-loading-${index}`}
                >
                  {report ? (
                    <ReviewIssueStamp
                      className="right-2 top-2"
                      issue={reviewIssues.forItem(report.id)[0]}
                    />
                  ) : null}
                  <div className="grid place-items-center px-4">
                    {report ? (
                      <CheckboxControl
                        ariaLabel={`Select ${report.author.person?.fullName ?? report.author.email ?? "weekly report"}`}
                        checked={bulk.isSelected(report.id)}
                        className="gap-0"
                        id={`weekly-review-select-${report.id}`}
                        onCheckedChange={(checked) =>
                          bulk.toggle(report.id, checked)
                        }
                      />
                    ) : (
                      <span
                        className={loadingPlaceholder(true, "control")}
                        data-placeholder="control"
                      />
                    )}
                  </div>
                  <ButtonControl
                    aria-pressed={Boolean(report && selectedId === report.id)}
                    className="min-h-[74px] w-full justify-between rounded-none border-0 px-5 py-4 pr-10 text-left hover:bg-surface-subtle aria-pressed:bg-surface-subtle aria-pressed:text-ink"
                    loading={!report}
                    onClick={
                      report
                        ? () => {
                            select(report.id);
                            setNote(report.reviewNote ?? "");
                          }
                        : undefined
                    }
                    variant="secondary"
                  >
                    <span className="grid gap-1">
                      <strong
                        className={loadingPlaceholder(!report, "text", "long")}
                        data-placeholder={!report ? "text" : undefined}
                        data-placeholder-width="long"
                      >
                        {report?.author.person?.fullName ??
                          report?.author.email ??
                          "Researcher name"}
                      </strong>
                      <small
                        className={cn(
                          "text-[.7rem] text-ink-muted",
                          loadingPlaceholder(!report, "label", "medium"),
                        )}
                        data-placeholder={!report ? "label" : undefined}
                        data-placeholder-width="medium"
                      >
                        {report
                          ? reportWeek(report.weekStart)
                          : "Reporting week"}
                      </small>
                      {report && reviewIssues.forItem(report.id)[0] ? (
                        <SemanticStatus
                          loading={!report}
                          tone={
                            reviewIssues.forItem(report.id)[0].tone ?? "warning"
                          }
                        >
                          {reviewIssues.forItem(report.id)[0].message}
                        </SemanticStatus>
                      ) : null}
                    </span>
                    <Badge
                      loading={!report}
                      tone={report ? statusTone(report.status) : "neutral"}
                    >
                      {report ? reportStatusLabel(report.status) : "Submitted"}
                    </Badge>
                  </ButtonControl>
                </div>
              ))}
              {reports && visible.length === 0 ? (
                <WorkspaceEmpty>
                  No reports match this review state.
                </WorkspaceEmpty>
              ) : null}
            </div>
          </WorkspacePanel>
        </div>

        <div className="min-w-0 border-l border-line-strong [&>section]:border-0 max-[900px]:border-l-0 max-[900px]:border-t">
          <WorkspacePanel
            description="Review outcomes and blockers in the context of the projects covered."
            eyebrow="Report detail"
            title={
              selected
                ? (selected.author.person?.fullName ??
                  selected.author.email ??
                  "Weekly report")
                : "Select a report"
            }
          >
            {!reports || selected ? (
              <div className="grid gap-0" data-loading={!reports || undefined}>
                <ReportSection
                  label="Projects"
                  loading={!reports}
                  value={
                    selected
                      ? selected.projects
                          .map(
                            ({ project }) =>
                              project.researchItem.title ?? "Untitled project",
                          )
                          .join(" · ")
                      : "Linked research projects"
                  }
                />
                <ReportSection
                  label="Evidence outputs"
                  loading={!reports}
                  value={
                    selected
                      ? selected.outputs.length
                        ? selected.outputs
                            .map(
                              ({ output }) =>
                                `${output.title ?? "Untitled output"} (${output.type === "PAPER" ? "paper" : "dataset"})`,
                            )
                            .join(" · ")
                        : "No paper or dataset linked."
                      : "Linked papers and datasets"
                  }
                />
                <ReportSection
                  label="Completed work and evidence"
                  loading={!reports}
                  value={
                    selected?.accomplishments ??
                    "Research outcomes and evidence from the reporting week."
                  }
                />
                <ReportSection
                  label="Blockers and decisions needed"
                  loading={!reports}
                  value={
                    selected
                      ? selected.blockers || "No blockers reported."
                      : "Constraints and decisions that need supervisor attention."
                  }
                />
                <ReportSection
                  label="Plan for next week"
                  loading={!reports}
                  value={
                    selected?.nextWeekPlan ??
                    "Expected research outcomes for the next reporting week."
                  }
                />
                {selected && reviewIssues.forItem(selected.id)[0] ? (
                  <div className="border-t border-line px-6 py-4 max-[640px]:p-5">
                    <SemanticStatus
                      loading={!reports}
                      tone={
                        reviewIssues.forItem(selected.id)[0].tone ?? "warning"
                      }
                    >
                      {reviewIssues.forItem(selected.id)[0].message}
                    </SemanticStatus>
                  </div>
                ) : null}
                {selected?.status === "SUBMITTED" ? (
                  <div className="grid gap-4 border-t border-line px-6 py-5 max-[640px]:p-5">
                    <FormField
                      htmlFor="weekly-review-note"
                      label="Supervisor note"
                      labelClassName="text-[.78rem] font-semibold tracking-[.04em]"
                    >
                      <TextareaControl
                        id="weekly-review-note"
                        onChange={(event) => setNote(event.target.value)}
                        placeholder="Acknowledge progress or explain a required change."
                        value={note}
                      />
                    </FormField>
                    <div className="flex flex-wrap justify-end gap-3 max-[640px]:grid max-[640px]:grid-cols-1">
                      <ButtonControl
                        disabled={
                          working ||
                          Boolean(
                            selected &&
                            reviewIssues.forItem(selected.id).length,
                          )
                        }
                        onClick={() => void review("CHANGES_REQUESTED")}
                        variant="secondary"
                      >
                        <RotateCcw aria-hidden="true" size={16} /> Request
                        changes
                      </ButtonControl>
                      <ButtonControl
                        disabled={
                          working ||
                          Boolean(
                            selected &&
                            reviewIssues.forItem(selected.id).length,
                          )
                        }
                        onClick={() => void review("REVIEWED")}
                        variant="primary"
                      >
                        <CheckCircle2 aria-hidden="true" size={16} /> Mark
                        reviewed
                      </ButtonControl>
                    </div>
                  </div>
                ) : selected?.reviewNote ? (
                  <ReportSection
                    label="Supervisor note"
                    value={selected.reviewNote}
                  />
                ) : null}
              </div>
            ) : (
              <WorkspaceEmpty>
                {missing
                  ? "This weekly report is no longer available. Choose another report from the queue."
                  : "Select a report from the queue."}
              </WorkspaceEmpty>
            )}
          </WorkspacePanel>
        </div>
      </WorkspaceRuleBand>
    </WorkspaceSurface>
  );
}

function ReportSection({
  label,
  value,
  loading = false,
}: {
  label: string;
  value: string;
  loading?: boolean;
}) {
  return (
    <section className="border-t border-line px-6 py-5 first:border-t-0 max-[640px]:p-5">
      <strong className="text-[.76rem] tracking-[.04em]">{label}</strong>
      <p
        className={cn(
          "mt-2 whitespace-pre-wrap leading-[1.55] text-ink-muted",
          loadingPlaceholder(loading, "text", "full"),
        )}
        data-placeholder={loading ? "text" : undefined}
        data-placeholder-width="full"
      >
        {value}
      </p>
    </section>
  );
}
