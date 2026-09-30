"use client";

import { cn } from "@/lib/cn";
import { loadingPlaceholder } from "@/lib/loading-style";
import { useDeferredValue, useEffect, useState } from "react";
import { PaginationControls } from "./pagination-controls";
import { StatePanel } from "./state-panel";
import { ToolbarSearchField } from "./ui/toolbar-search-field";
import { DateRangePicker } from "./ui/date-range-picker";
import { SelectControl } from "./ui/select-control";
import { Badge, type BadgeTone } from "./ui/badge";
import { DataTableShell } from "@/components/ui/data-table";
import { apiRequest } from "@/lib/client-api";
import type { PaginatedResponse } from "@/lib/types";
import { ButtonControl } from "@/components/ui/button-control";
import { FormField } from "@/components/ui/form-field";
import { ReviewIssueStamp } from "@/components/ui/semantic-status";
import type { ReviewIssue } from "@/lib/review-issues";
import {
  ReviewSplit,
  WorkspaceRuleBand,
} from "@/components/ui/workspace-surface";
import { ApplicationReviewDetail } from "@/components/application-review-detail";
import { useReviewSelection } from "@/lib/use-review-selection";

interface ApplicationSummary {
  id: string;
  fullName: string;
  email: string;
  status: string;
  createdAt: string;
  position: { title: string };
}

const STATUSES = [
  "ALL",
  "NEEDS_REVIEW",
  "PARSING",
  "PARSE_FAILED",
  "ACCEPTED",
  "REJECTED",
];

const LOADING_ROWS = 3;

function label(value: string) {
  return value.replaceAll("_", " ").toLowerCase();
}

export function ApplicationReviewQueue() {
  const [result, setResult] = useState<PaginatedResponse<ApplicationSummary>>();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [status, setStatus] = useState("ALL");
  const [sort, setSort] = useState("NEWEST");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let active = true;
    const params = new URLSearchParams({
      page: String(page),
      pageSize: "20",
      sort,
    });
    if (deferredSearch.trim()) params.set("search", deferredSearch.trim());
    if (status !== "ALL") params.set("status", status);
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    void apiRequest<PaginatedResponse<ApplicationSummary>>(
      `/applications?${params}`,
      { method: "GET" },
    )
      .then((response) => {
        if (!active) return;
        setResult(response);
        setError(undefined);
      })
      .catch((caught: unknown) => {
        if (active)
          setError(
            caught instanceof Error
              ? caught.message
              : "Unable to load applications.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [deferredSearch, from, page, reload, sort, status, to]);

  const items = result?.items ?? [];
  const initialLoading = loading && !result;
  const { selectedId, select } = useReviewSelection("/workspace/applications", {
    firstId: items[0]?.id,
    ready: !loading,
    viewKey: `${page}|${deferredSearch}|${status}|${sort}|${from}|${to}`,
  });
  const outsideQueue = Boolean(
    selectedId && result && !items.some(({ id }) => id === selectedId),
  );

  function openNextAfterDecision() {
    const index = items.findIndex(({ id }) => id === selectedId);
    const next =
      index >= 0 ? (items[index + 1] ?? items[index - 1]) : undefined;
    select(next?.id);
    setLoading(true);
    setReload((current) => current + 1);
  }

  const filtered = Boolean(search || from || to || status !== "ALL");
  const clear = () => {
    setLoading(true);
    setSearch("");
    setStatus("ALL");
    setFrom("");
    setTo("");
    setPage(1);
  };

  return (
    <DataTableShell>
      <WorkspaceRuleBand contentClassName="grid min-w-0 grid-cols-[minmax(220px,1.4fr)_repeat(2,minmax(140px,.52fr))_minmax(220px,.8fr)_auto] items-end gap-[.8rem] px-[var(--workspace-gutter)] py-3.5 max-[980px]:grid-cols-2 max-[640px]:grid-cols-1 max-[640px]:px-4">
        <ToolbarSearchField
          id="application-search"
          label="Search"
          onChange={(event) => {
            setLoading(true);
            setSearch(event.target.value);
            setPage(1);
          }}
          placeholder="Name, email, or position"
          value={search}
        />
        <FormField htmlFor="application-status" label="Status">
          <SelectControl
            id="application-status"
            onValueChange={(value) => {
              setLoading(true);
              setStatus(value);
              setPage(1);
            }}
            options={STATUSES.map((value) => ({
              label: value === "ALL" ? "All statuses" : label(value),
              value,
            }))}
            value={status}
          />
        </FormField>
        <FormField htmlFor="application-sort" label="Sort">
          <SelectControl
            id="application-sort"
            onValueChange={(value) => {
              setLoading(true);
              setSort(value);
              setPage(1);
            }}
            options={[
              { label: "Newest", value: "NEWEST" },
              { label: "Oldest", value: "OLDEST" },
              { label: "Name", value: "NAME" },
            ]}
            value={sort}
          />
        </FormField>
        <FormField label="Date range">
          <DateRangePicker
            from={from}
            onChange={(range) => {
              setLoading(true);
              setFrom(range.from);
              setTo(range.to);
              setPage(1);
            }}
            to={to}
          />
        </FormField>
        <ButtonControl disabled={!filtered} onClick={clear}>
          Clear
        </ButtonControl>
      </WorkspaceRuleBand>

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
          body="The connection dropped. Nothing was lost; reconnect to continue."
          title="Could not load applications"
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
              <ApplicationReviewDetail
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
                  Applications
                </p>
                <PaginationControls
                  loading={loading}
                  onPageChange={(nextPage) => {
                    setLoading(true);
                    setPage(nextPage);
                  }}
                  page={page}
                  pageSize={result?.pageSize ?? 20}
                  total={result?.total}
                  totalPages={result?.totalPages ?? 1}
                />
              </div>
              <div data-loading={initialLoading || undefined}>
                {(initialLoading
                  ? Array.from({ length: LOADING_ROWS }, () => undefined)
                  : items
                ).map((application, row) => (
                  <ApplicationQueueRow
                    application={application}
                    key={application?.id ?? `application-loading-${row}`}
                    onSelect={() => application && select(application.id)}
                    selected={Boolean(
                      application && application.id === selectedId,
                    )}
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
            filtered ? { label: "Clear filters", onClick: clear } : undefined
          }
          body={
            filtered
              ? "Try a broader date range or remove an active filter."
              : "New applications will appear here after resume processing."
          }
          title={
            filtered
              ? "No matching applications"
              : "The application queue is clear"
          }
          variant={filtered ? "filtered" : "empty"}
        />
      )}
    </DataTableShell>
  );
}

function ApplicationQueueRow({
  application,
  onSelect,
  selected,
}: {
  application?: ApplicationSummary;
  onSelect: () => void;
  selected: boolean;
}) {
  const loading = !application;
  const failed = application?.status === "PARSE_FAILED";
  return (
    <div
      className={cn(
        "relative border-b border-line transition-colors last:border-b-0",
        selected ? "bg-brand-soft" : "hover:bg-surface-subtle",
      )}
    >
      <button
        aria-current={selected || undefined}
        className="grid w-full min-w-0 cursor-pointer gap-[.35rem] border-0 bg-transparent py-3.5 pr-10 pl-[var(--workspace-gutter)] text-left disabled:cursor-default"
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
          {application?.fullName ?? "Loading applicant"}
        </strong>
        <span
          className={cn(
            "truncate text-[.72rem] text-ink-muted",
            loadingPlaceholder(loading, "label", "long"),
          )}
          data-placeholder="label"
          data-placeholder-width="long"
        >
          {application
            ? `${application.position.title} · ${new Date(application.createdAt).toLocaleDateString()}`
            : "Loading position and date"}
        </span>
        <span className="flex flex-wrap gap-[.4rem]">
          <Badge
            dot
            loading={loading}
            live={application?.status === "NEEDS_REVIEW"}
            tone={application ? applicationTone(application.status) : "neutral"}
          >
            {application ? label(application.status) : "Loading"}
          </Badge>
          <Badge
            dot
            loading={loading}
            tone={
              failed
                ? "error"
                : application?.status === "PARSING"
                  ? "warning"
                  : "success"
            }
          >
            {failed
              ? "CV not readable"
              : application?.status === "PARSING"
                ? "CV processing"
                : "CV passed"}
          </Badge>
        </span>
      </button>
      {application ? (
        <ReviewIssueStamp
          className="top-2 right-2"
          issue={applicationStatusIssue(application)}
        />
      ) : null}
    </div>
  );
}

function applicationStatusIssue(
  application: ApplicationSummary,
): ReviewIssue | undefined {
  if (application.status === "PARSE_FAILED") {
    return {
      code: "APPLICATION_PARSE_FAILED",
      itemId: application.id,
      message: "Automatic CV processing could not read this file.",
      tone: "error",
    };
  }
  if (application.status === "PARSING") {
    return {
      code: "APPLICATION_PARSE_PENDING",
      itemId: application.id,
      message: "Automatic CV processing is still running.",
      tone: "pending",
    };
  }
  return undefined;
}

function applicationTone(status: string): BadgeTone {
  if (status === "NEEDS_REVIEW") return "warning";
  if (status === "PARSE_FAILED" || status === "REJECTED") return "error";
  if (status === "ACCEPTED") return "success";
  if (status === "PARSING") return "warning";
  return "neutral";
}
