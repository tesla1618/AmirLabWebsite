"use client";

import { cn } from "@/lib/cn";
import { loadingPlaceholder } from "@/lib/loading-style";
import { useReviewSelection } from "@/lib/use-review-selection";
import {
  useCallback,
  useEffect,
  useState,
  useRef,
  type SyntheticEvent,
} from "react";
import { ApiRequestError, apiRequest } from "@/lib/client-api";
import { useReviewIssues } from "@/lib/use-review-issues";
import type { ReviewIssue } from "@/lib/review-issues";
import {
  ReviewIssueStamp,
  SemanticStatus,
} from "@/components/ui/semantic-status";
import { PaginationControls } from "@/components/pagination-controls";
import { SelectControl } from "@/components/ui/select-control";
import { InputControl, TextareaControl } from "@/components/ui/form-controls";
import { FormField } from "@/components/ui/form-field";
import { ButtonAnchor, ButtonControl } from "@/components/ui/button-control";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { ToolbarSearchField } from "@/components/ui/toolbar-search-field";
import { ReviewActions, type ReviewAction } from "@/components/review-actions";
import { BulkReviewBar } from "@/components/bulk-review-bar";
import { CheckboxControl } from "@/components/ui/checkbox-control";
import { useBulkSelection } from "@/lib/use-bulk-selection";
import { StatePanel } from "@/components/state-panel";
import type { PaginatedResponse } from "@/lib/types";
import { useNotifications } from "@/components/notification-provider";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { applyResearchLiveEvent } from "@/lib/research-live-events";
import {
  ReviewSplit,
  WorkspaceRuleBand,
} from "@/components/ui/workspace-surface";

interface ReviewResearch {
  id: string;
  title: string | null;
  summary: string | null;
  canonicalUrl: string | null;
  legacyUrl: string | null;
  type: "PAPER" | "DATASET";
  reviewStatus: "NEEDS_REVIEW" | "CHANGES_REQUESTED" | "PUBLISHED" | "REJECTED";
  automationVersion: number;
  automationState: "IDLE" | "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED";
  paper: {
    citation: string | null;
    doi: string | null;
    publicationType: string | null;
    venue: string | null;
    year: number | null;
  } | null;
  dataset: {
    accessNotes: string | null;
    license: string | null;
    modality: string | null;
    version: string | null;
  } | null;
  sourceSnapshot: {
    status: "PENDING" | "FETCHED" | "UNAVAILABLE" | "FAILED";
    failureReason: string | null;
    fetchedAt: string | null;
    metadata: { authors?: Array<{ name: string; orcid?: string }>; manuallyVerified?: boolean; note?: string } | null;
    updatedAt?: string;
  } | null;
  reviewIssues?: ReviewIssue[];
  contributors: Array<{
    displayName: string;
    sortOrder: number;
    person: { id: string; fullName: string; slug: string } | null;
    matches: Array<{
      id: string;
      confidence: number | null;
      source: "SOURCE_METADATA" | "USER_CLAIM" | "ADMIN_MANUAL";
      status: "PROPOSED" | "VERIFIED" | "REJECTED";
      evidence: { matchReason?: string; orcid?: string } | null;
      person: { id: string; fullName: string; slug: string };
      requestedBy: { email: string | null } | null;
    }>;
  }>;
  submittedById: string | null;
  submittedBy: {
    email: string | null;
    isSystemAccount?: boolean;
    person: { id: string; fullName: string } | null;
  } | null;
}

type SourceStatus = NonNullable<ReviewResearch["sourceSnapshot"]>["status"];

interface LinkablePerson {
  id: string;
  fullName: string;
  slug: string;
}

type ResearchDecision =
  "NEEDS_REVIEW" | "PUBLISHED" | "CHANGES_REQUESTED" | "REJECTED";

function researchLabel(item: ReviewResearch): string {
  return item.title ?? item.paper?.citation ?? "Untitled research item";
}

function proposalReason(
  match: ReviewResearch["contributors"][number]["matches"][number],
): string {
  if (match.evidence?.matchReason) return match.evidence.matchReason;
  if (match.evidence?.orcid) return "ORCID";
  if (match.source === "SOURCE_METADATA") return "Canonical metadata";
  if (match.source === "ADMIN_MANUAL") return "Manual link";
  return "Member claim";
}

function loadingResearchItem(index = 0): ReviewResearch {
  return {
    id: `research-loading-${index}`,
    title: "Loading research submission",
    summary: "Loading submission summary and evidence.",
    canonicalUrl: "#",
    legacyUrl: null,
    type: "PAPER",
    reviewStatus: "NEEDS_REVIEW",
    automationVersion: 0,
    automationState: "IDLE",
    paper: {
      citation: "Loading citation",
      doi: null,
      publicationType: null,
      venue: null,
      year: null,
    },
    dataset: null,
    sourceSnapshot: {
      status: "PENDING",
      failureReason: null,
      fetchedAt: null,
      metadata: null,
    },
    reviewIssues: [],
    contributors: Array.from({ length: 4 }, (_, contributorIndex) => ({
      displayName: "Loading contributor",
      sortOrder: contributorIndex,
      person: null,
      matches: [],
    })),
    submittedById: null,
    submittedBy: null,
  };
}

export function ResearchReviewQueue() {
  const {
    refreshUnreadCount,
    researchRefreshVersion,
    showToast,
    subscribeResearchEvents,
  } = useNotifications();
  const [items, setItems] = useState<ReviewResearch[]>([]);
  const [result, setResult] = useState<PaginatedResponse<ReviewResearch>>();
  const [focusedItem, setFocusedItem] = useState<ReviewResearch>();
  const [missingId, setMissingId] = useState<string>();
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [type, setType] = useState("ALL");
  const [status, setStatus] = useState("ALL");
  const [sort, setSort] = useState("OLDEST");
  const [reload, setReload] = useState(0);
  const [people, setPeople] = useState<LinkablePerson[]>([]);
  const [submitters, setSubmitters] = useState<LinkablePerson[]>([]);
  const [manualPeople, setManualPeople] = useState<Record<string, string>>({});
  const [relationBusy, setRelationBusy] = useState<Set<string>>(
    () => new Set(),
  );

  function beginRelation(key: string) {
    setRelationBusy((current) => new Set(current).add(key));
  }

  function endRelation(key: string) {
    setRelationBusy((current) => {
      const next = new Set(current);
      next.delete(key);
      return next;
    });
  }
  const [editingId, setEditingId] = useState<string>();
  const [editSnapshot, setEditSnapshot] = useState<ReviewResearch>();
  const [editDirty, setEditDirty] = useState(false);
  const [discardEditor, setDiscardEditor] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const actionIssues = useReviewIssues();
  const { selectedId: selected, select } = useReviewSelection(
    "/workspace/research",
    {
      firstId: items[0]?.id,
      ready: !loading,
      viewKey: `${page}|${search}|${sort}|${status}|${type}`,
    },
  );

  function beginRefresh() {
    if (result) setLoading(true);
  }

  function changePage(nextPage: number) {
    beginRefresh();
    setPage(nextPage);
  }

  useEffect(() => {
    void apiRequest<LinkablePerson[]>("/research/submitters", { method: "GET" })
      .then(setSubmitters)
      .catch(() => setError("Research owners could not be loaded. Refresh to retry."));
    void apiRequest<LinkablePerson[]>("/research-connections/people", {
      method: "GET",
    })
      .then(setPeople)
      .catch(() => setPeople([]));
  }, []);

  useEffect(() => {
    let active = true;
    const timeout = window.setTimeout(() => {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: "10",
        sort,
      });
      if (search.trim()) params.set("search", search.trim());
      if (type !== "ALL") params.set("type", type);
      if (status !== "ALL") params.set("status", status);

      setLoading(true);
      setError(undefined);
      const queueRequest = apiRequest<PaginatedResponse<ReviewResearch>>(
        `/research-review?${params}`,
        { method: "GET" },
      );
      void queueRequest
        .then((queue) => {
          if (!active) return;
          setResult(queue);
          setItems(queue.items);
        })
        .catch((caught: unknown) => {
          if (active) {
            setError(
              caught instanceof Error
                ? caught.message
                : "Unable to load research.",
            );
          }
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }, 250);
    return () => {
      active = false;
      window.clearTimeout(timeout);
    };
  }, [page, reload, researchRefreshVersion, search, sort, status, type]);

  // A linked record outside the current queue view opens in the detail pane
  // only; it is never merged into the paginated list.
  useEffect(() => {
    if (
      !selected ||
      !result ||
      focusedItem?.id === selected ||
      items.some((candidate) => candidate.id === selected)
    ) {
      return;
    }
    let active = true;
    void apiRequest<ReviewResearch>(`/research-review/${selected}`, {
      method: "GET",
    })
      .then((focus) => {
        if (!active) return;
        setFocusedItem(focus);
        setMissingId(undefined);
      })
      .catch(() => {
        if (active) setMissingId(selected);
      });
    return () => {
      active = false;
    };
  }, [focusedItem?.id, items, result, selected]);

  const refreshResearchItem = useCallback(
    async (itemId: string): Promise<void> => {
      try {
        const updated = await apiRequest<ReviewResearch>(
          `/research-review/${itemId}`,
          { method: "GET" },
        );
        setItems((current) =>
          current.map((candidate) =>
            candidate.id === updated.id ? updated : candidate,
          ),
        );
        setFocusedItem((current) =>
          current?.id === updated.id ? updated : current,
        );
      } catch {
        setError(
          "The review was saved, but the updated contributor data could not be loaded.",
        );
      }
    },
    [],
  );

  useEffect(() => {
    return subscribeResearchEvents((event) => {
      setItems((current) =>
        current.map((candidate) =>
          candidate.id === event.researchItemId
            ? { ...candidate, ...applyResearchLiveEvent(candidate, event) }
            : candidate,
        ),
      );
      setFocusedItem((current) =>
        current?.id === event.researchItemId
          ? { ...current, ...applyResearchLiveEvent(current, event) }
          : current,
      );
      setReload((current) => current + 1);
      if (selected === event.researchItemId) {
        void refreshResearchItem(event.researchItemId);
      }
    });
  }, [refreshResearchItem, selected, subscribeResearchEvents]);

  useEffect(() => {
    if (!researchRefreshVersion || !selected) return;
    const timeout = window.setTimeout(() => void refreshResearchItem(selected), 0);
    return () => window.clearTimeout(timeout);
  }, [researchRefreshVersion, selected, refreshResearchItem]);

  function captureItemError(itemId: string, error: ApiRequestError) {
    if (error.issues.length) actionIssues.capture(error);
    else
      actionIssues.setOne(itemId, {
        code: "RESEARCH_REVIEW_FAILED",
        message: "This research review decision could not be saved.",
        tone: "error",
      });
  }

  async function decide({
    note,
    status,
  }: {
    note?: string;
    status: ResearchDecision;
  }) {
    if (!selected || !item) return;
    setError(undefined);
    await apiRequest(`/research/${selected}/review`, {
      body: JSON.stringify({ ...(note ? { note } : {}), status, expectedAutomationVersion: item.automationVersion }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    const index = items.findIndex((candidate) => candidate.id === selected);
    const next =
      index >= 0 ? (items[index + 1] ?? items[index - 1]) : undefined;
    select(next?.id);
    if (items.length === 1 && page > 1) {
      setPage((current) => current - 1);
    } else {
      setReload((current) => current + 1);
    }
    setEditingId(undefined);
    setFocusedItem(undefined);
    void refreshUnreadCount().catch(() => undefined);
  }

  async function saveRecordEdit(
    event: SyntheticEvent<HTMLFormElement, SubmitEvent>,
  ) {
    event.preventDefault();
    if (!item || !editSnapshot || editSnapshot.id !== item.id || loadingDetail) return;
    const form = new FormData(event.currentTarget);
    const contributors = String(form.get("contributors") ?? "")
      .split("\n")
      .map((name) => name.trim())
      .filter(Boolean);
    if (!form.get("submitterPersonId")) {
      setError("Select the person this research belongs to.");
      return;
    }
    setEditSaving(true);
    setError(undefined);
    try {
      const body: Record<string, unknown> = {
        expectedAutomationVersion: editSnapshot.automationVersion,
        submitterPersonId: form.get("submitterPersonId"),
        canonicalUrl: form.get("canonicalUrl"),
        contributors,
        summary: form.get("summary") || undefined,
        title: form.get("title"),
        type: item.type,
      };
      if (item.type === "PAPER") {
        body.citation = form.get("citation") || undefined;
        body.doi = form.get("doi") || undefined;
        body.publicationType = form.get("publicationType") || undefined;
        body.venue = form.get("venue") || undefined;
        const year = Number(form.get("year"));
        if (year) body.year = year;
      } else {
        body.accessNotes = form.get("accessNotes") || undefined;
        body.license = form.get("license") || undefined;
        body.modality = form.get("modality") || undefined;
        body.version = form.get("version") || undefined;
      }
      const updated = await apiRequest<ReviewResearch>(`/research/${item.id}`, {
        body: JSON.stringify(body),
        headers: { "content-type": "application/json" },
        method: "PATCH",
      });
      setFocusedItem(updated);
      setItems((current) =>
        current.map((candidate) =>
          candidate.id === updated.id ? updated : candidate,
        ),
      );
      setEditingId(undefined);
      setEditDirty(false);
      setReload((current) => current + 1);
      showToast({
        body: updated.sourceSnapshot?.status === "PENDING"
          ? "Changes saved. Source verification is in progress."
          : "Changes saved. Existing verification and publication status were preserved.",
        title: "Research record updated",
      });
    } catch (caught) {
      const requestError =
        caught instanceof ApiRequestError ? caught : undefined;
      if (requestError?.issues.length) actionIssues.capture(requestError);
      else
        actionIssues.setOne(item.id, {
          code: "RESEARCH_EDIT_FAILED",
          message: "This research record could not be updated.",
          tone: "error",
        });
      showToast({
        body:
          requestError?.message ?? "The research record could not be updated.",
        title: "Research record was not updated",
        tone: "error",
      });
    } finally {
      setEditSaving(false);
    }
  }

  async function reviewMatch(
    itemId: string,
    id: string,
    { note, status }: { note?: string; status: "VERIFIED" | "REJECTED" },
  ) {
    beginRelation(id);
    setError(undefined);
    try {
      const current =
        items.find((candidate) => candidate.id === itemId) ??
        (focusedItem?.id === itemId ? focusedItem : undefined);
      if (!current) throw new Error("Research record is no longer loaded.");
      await apiRequest(`/contributor-matches/${id}/review`, {
        body: JSON.stringify({
          ...(note ? { note } : {}),
          expectedAutomationVersion: current.automationVersion,
          status,
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      actionIssues.clearOne(itemId);
      await refreshResearchItem(itemId);
    } catch (caught) {
      if (caught instanceof ApiRequestError && caught.issues.length)
        actionIssues.capture(caught);
      else
        actionIssues.setOne(itemId, {
          code: "CONTRIBUTOR_REVIEW_FAILED",
          message: "A contributor relationship could not be reviewed.",
          tone: "error",
        });
      throw caught;
    } finally {
      endRelation(id);
    }
  }

  async function verifyContributor(
    itemId: string,
    sortOrder: number,
    personId: string,
    selectedMatch?: ReviewResearch["contributors"][number]["matches"][number],
  ) {
    if (selectedMatch?.status === "PROPOSED") {
      try {
        await reviewMatch(itemId, selectedMatch.id, { status: "VERIFIED" });
        showToast({
          body: `${selectedMatch.person.fullName} was verified for this contributor.`,
          title: "Contributor verified",
        });
      } catch {
        showToast({
          body: "The selected contributor match could not be verified.",
          title: "Contributor was not verified",
          tone: "error",
        });
      }
      return;
    }
    await linkContributor(itemId, sortOrder, personId);
  }

  async function linkContributor(
    itemId: string,
    sortOrder: number,
    personId: string,
  ) {
    const key = `${itemId}:${sortOrder}`;
    if (!personId) return;
    beginRelation(key);
    setError(undefined);
    try {
      const current =
        items.find((candidate) => candidate.id === itemId) ??
        (focusedItem?.id === itemId ? focusedItem : undefined);
      if (!current) throw new Error("Research record is no longer loaded.");
      await apiRequest(`/research/${itemId}/contributors/${sortOrder}/link`, {
        body: JSON.stringify({
          expectedAutomationVersion: current.automationVersion,
          personId,
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      setManualPeople((current) => {
        const next = { ...current };
        delete next[key];
        return next;
      });
      actionIssues.clearOne(itemId);
      await refreshResearchItem(itemId);
      showToast({
        body: "The contributor is now linked to the verified person record.",
        title: "Contributor linked",
      });
    } catch (caught) {
      const requestError =
        caught instanceof ApiRequestError ? caught : undefined;
      if (requestError?.issues.length) actionIssues.capture(requestError);
      else
        actionIssues.setOne(itemId, {
          code: "CONTRIBUTOR_LINK_FAILED",
          message: "A contributor could not be linked to this record.",
          tone: "error",
        });
      showToast({
        body: requestError?.message ?? "The contributor could not be linked.",
        title: "Contributor was not linked",
        tone: "error",
      });
    } finally {
      endRelation(key);
    }
  }

  async function rediscover(itemId: string) {
    const key = `discover:${itemId}`;
    beginRelation(key);
    setError(undefined);
    try {
      await apiRequest(`/research/${itemId}/discover`, { method: "POST" });
      const markPending = (candidate: ReviewResearch): ReviewResearch =>
        candidate.id === itemId
          ? {
              ...candidate,
              reviewIssues: [
                ...(candidate.reviewIssues ?? []).filter(
                  ({ code }) =>
                    ![
                      "SOURCE_DISCOVERY_FAILED",
                      "SOURCE_METADATA_UNAVAILABLE",
                      "SOURCE_DISCOVERY_PENDING",
                    ].includes(code ?? ""),
                ),
                {
                  code: "SOURCE_DISCOVERY_PENDING",
                  itemId,
                  message: "Canonical source discovery is still in progress.",
                  tone: "pending",
                },
              ],
              sourceSnapshot: {
                failureReason: null,
                fetchedAt: candidate.sourceSnapshot?.fetchedAt ?? null,
                metadata: candidate.sourceSnapshot?.metadata ?? null,
                status: "PENDING",
              },
            }
          : candidate;
      setItems((current) => current.map(markPending));
      setFocusedItem((current) => (current ? markPending(current) : current));
      actionIssues.clearOne(itemId);
      showToast({
        body: "Canonical source evidence is being checked in the background.",
        title: "Source check started",
      });
    } catch (caught) {
      const requestError =
        caught instanceof ApiRequestError ? caught : undefined;
      if (requestError?.issues.length) actionIssues.capture(requestError);
      else
        actionIssues.setOne(itemId, {
          code: "SOURCE_CHECK_FAILED",
          message: "The canonical source check could not be started.",
          tone: "error",
        });
      showToast({
        body: requestError?.message ?? "The source check could not be started.",
        title: "Source check was not started",
        tone: "error",
      });
    } finally {
      endRelation(key);
    }
  }

  const selectableItems = items;
  const bulk = useBulkSelection(selectableItems.map(({ id }) => id));
  const selectedResearchItems = selectableItems.filter(({ id }) => bulk.isSelected(id));
  const issuesFor = (candidate: ReviewResearch): ReviewIssue[] => [
    ...(candidate.reviewIssues ?? []),
    ...actionIssues.forItem(candidate.id),
  ];
  const selectedAttentionCount = selectedResearchItems.filter(
    (candidate) => issuesFor(candidate).length > 0,
  ).length;
  const commonBulkStatuses = commonResearchBulkStatuses(
    selectedResearchItems,
    relationBusy,
  );
  const commonBulkActions = researchBulkActions(
    commonBulkStatuses,
    selectedResearchItems.length,
  ).map((action) => ({ ...action, disabled: editDirty || editSaving }));
  const initialLoading = loading && !result;
  const item =
    (focusedItem?.id === selected ? focusedItem : undefined) ??
    items.find((candidate) => candidate.id === selected) ??
    (initialLoading ? loadingResearchItem() : undefined);
  const outsideQueue = Boolean(
    item &&
    !initialLoading &&
    !items.some((candidate) => candidate.id === item.id),
  );
  const editing = Boolean(item && editingId === item.id);
  const ownerMissing = Boolean(item && (!item.submittedBy?.person || item.submittedBy.isSystemAccount));
  const sourcePending =
    item?.automationState === "QUEUED" || item?.automationState === "RUNNING" ||
    item?.sourceSnapshot?.status === "PENDING" ||
    relationBusy.has(`discover:${item?.id}`) || editDirty;
  const hasProposedMatches = Boolean(
    item?.contributors.some((contributor) =>
      contributor.matches.some((match) => match.status === "PROPOSED"),
    ),
  );
  async function decideBulk({
    note,
    status: decisionStatus,
  }: {
    note?: string;
    status: ResearchDecision;
  }) {
    if (!selectedResearchItems.length) return;
    await apiRequest("/research-review/bulk-review", {
      body: JSON.stringify({
        ids: selectedResearchItems.map(({ id }) => id),
        expectedAutomationVersions: selectedResearchItems.map(({ automationVersion }) => automationVersion),
        ...(note ? { note } : {}),
        status: decisionStatus,
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    bulk.clear();
    select(undefined);
    setEditingId(undefined);
    setFocusedItem(undefined);
    setLoading(true);
    if (selectedResearchItems.length === items.length && page > 1) {
      setPage((current) => current - 1);
    } else {
      setReload((current) => current + 1);
    }
    void refreshUnreadCount().catch(() => undefined);
  }

  const loadingRows = initialLoading;
  const loadingDetail = initialLoading;
  const refreshing = loading && Boolean(result);
  const renderedItems =
    loadingRows && !items.length
      ? Array.from({ length: 7 }, (_, index) => loadingResearchItem(index + 1))
      : items;

  return (
    <div className="grid min-w-0 gap-4">
      <ConfirmDialog
        open={discardEditor}
        title="Discard unsaved changes?"
        description="Your edits have not been saved. Keep editing or discard them."
        confirmLabel="Discard changes"
        cancelLabel="Keep editing"
        tone="danger"
        busy={editSaving}
        onCancel={() => setDiscardEditor(false)}
        onConfirm={() => { setDiscardEditor(false); setEditingId(undefined); setEditDirty(false); }}
      />
      <WorkspaceRuleBand contentClassName="grid min-w-0 grid-cols-[minmax(220px,1.5fr)_repeat(3,minmax(140px,.7fr))] items-end gap-[.8rem] px-[var(--workspace-gutter)] py-3.5 max-[980px]:grid-cols-2 max-[640px]:grid-cols-1 max-[640px]:px-4">
        <ToolbarSearchField
          id="research-review-search"
          label="Search queue"
          onChange={(event) => {
            beginRefresh();
            setSearch(event.target.value);
            setPage(1);
          }}
          placeholder="Title, author, citation, or URL"
          value={search}
        />
        <FormField htmlFor="research-review-type" label="Type">
          <SelectControl
            id="research-review-type"
            onValueChange={(value) => {
              beginRefresh();
              setType(value);
              setPage(1);
            }}
            options={[
              { label: "All types", value: "ALL" },
              { label: "Papers", value: "PAPER" },
              { label: "Datasets", value: "DATASET" },
            ]}
            value={type}
          />
        </FormField>
        <FormField htmlFor="research-review-status" label="Status">
          <SelectControl
            id="research-review-status"
            onValueChange={(value) => {
              beginRefresh();
              setStatus(value);
              setPage(1);
            }}
            options={[
              { label: "Active review", value: "ALL" },
              { label: "Needs review", value: "NEEDS_REVIEW" },
              { label: "Changes requested", value: "CHANGES_REQUESTED" },
              { label: "Published", value: "PUBLISHED" },
              { label: "Rejected", value: "REJECTED" },
            ]}
            value={status}
          />
        </FormField>
        <FormField htmlFor="research-review-sort" label="Sort">
          <SelectControl
            id="research-review-sort"
            onValueChange={(value) => {
              beginRefresh();
              setSort(value);
              setPage(1);
            }}
            options={[
              { label: "Oldest first", value: "OLDEST" },
              { label: "Newest first", value: "NEWEST" },
              { label: "Title A-Z", value: "TITLE" },
            ]}
            value={sort}
          />
        </FormField>
      </WorkspaceRuleBand>
      {loading || items.length ? (
        <BulkReviewBar
          actions={commonBulkActions}
          attentionCount={selectedAttentionCount}
          loading={loading}
          onClear={bulk.clear}
          onSelectAll={bulk.toggleAll}
          onError={actionIssues.capture}
          onSubmit={decideBulk}
          onSuccess={actionIssues.clear}
          selectAllState={bulk.selectAllState}
          selectableCount={selectableItems.length}
          selectedCount={bulk.selectedCount}
          successBody={(decisionStatus) =>
            `${selectedResearchItems.length} research review${selectedResearchItems.length === 1 ? "" : "s"} moved to ${decisionStatus.replaceAll("_", " ").toLowerCase()}.`
          }
          successTitle="Bulk research review saved"
        />
      ) : null}
      {error && !result && !loading ? (
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
          title="Could not load research"
          variant="error"
        />
      ) : (
        <ReviewSplit
          detailLoading={loadingDetail}
          dimQueue={refreshing}
          queue={
            <>
              <div className="grid min-w-0 items-stretch gap-3 border-b border-line px-[var(--workspace-gutter)] py-4">
                <div>
                  <p className="m-0 mb-4 font-[var(--font-sans)] text-[.75rem] font-extrabold uppercase tracking-[.12em] text-brand">
                    Review queue
                  </p>
                </div>
                {loading || result ? (
                  <PaginationControls
                    loading={loading}
                    onPageChange={changePage}
                    page={page}
                    pageSize={result?.pageSize ?? 10}
                    total={result?.total}
                    totalPages={result?.totalPages ?? 1}
                  />
                ) : null}
              </div>
              {renderedItems.length ? (
                <div data-loading={loadingRows || undefined}>
                  <div className="flex flex-col">
                    {renderedItems.map((candidate) => (
                      <div
                        className={`relative grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-stretch border-b border-line transition-colors last:border-b-0 ${candidate.id === selected ? "bg-brand-soft" : "bg-transparent hover:bg-surface-subtle"}`}
                        key={candidate.id}
                      >
                        {!loadingRows ? (
                          <ReviewIssueStamp
                            className="right-2 top-2"
                            issue={issuesFor(candidate)[0]}
                          />
                        ) : null}
                        <div className="grid place-items-center px-3">
                          {loadingRows ? (
                            <span
                              className={loadingPlaceholder(true, "control")}
                              data-placeholder="control"
                            />
                          ) : (
                            <CheckboxControl
                              ariaLabel={`Select ${researchLabel(candidate)} review`}
                              checked={bulk.isSelected(candidate.id)}
                              className="gap-0"
                              disabled={editDirty}
                              id={`research-review-select-${candidate.id}`}
                              onCheckedChange={(checked) =>
                                bulk.toggle(candidate.id, checked)
                              }
                            />
                          )}
                        </div>
                        <button
                          className="grid min-h-[88px] w-full min-w-0 cursor-pointer gap-[.4rem] border-0 bg-transparent p-[.85rem_.9rem] pr-10 text-left"
                          disabled={loadingRows}
                          onClick={() => {
                            if (editDirty || editSaving) {
                              showToast({ title: "Unsaved changes", body: "Save or cancel your edits before selecting another record." });
                              return;
                            }
                            select(candidate.id);
                          }}
                          type="button"
                        >
                          <div className="w-fit capitalize">
                            <Badge tone="info" loading={loadingRows}>
                              {candidate.type.toLowerCase()}
                            </Badge>
                          </div>
                          <span
                            className={cn(
                              "line-clamp-2 [overflow-wrap:anywhere] font-sans text-[.95rem] font-normal normal-case leading-[1.35] tracking-normal text-ink",
                              loadingPlaceholder(loadingRows, "text", "long"),
                            )}
                            data-placeholder={loadingRows ? "text" : undefined}
                            data-placeholder-width="long"
                          >
                            {researchLabel(candidate)}
                          </span>
                          {!loadingRows && issuesFor(candidate)[0] ? (
                            <SemanticStatus
                              tone={issuesFor(candidate)[0].tone ?? "pending"}
                            >
                              {issuesFor(candidate)[0].message}
                            </SemanticStatus>
                          ) : null}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="m-0 text-[.82rem] leading-[1.5] text-ink-muted">
                  No submissions match these filters.
                </p>
              )}
            </>
          }
          detail={
            <>
              {item ? (
                <>
                  {outsideQueue ? (
                    <p className="m-0 font-mono text-[.62rem] tracking-[.08em] text-ink-muted uppercase">
                      Opened from a link · not in the current queue view
                    </p>
                  ) : null}
                  <header className="grid gap-[.65rem]">
                    <div className="flex flex-wrap items-center gap-[.7rem] text-[.82rem] text-ink-muted">
                      <div className="capitalize">
                        <Badge tone="info" loading={loadingDetail}>
                          {item.type.toLowerCase()}
                        </Badge>
                      </div>
                      <span
                        className={cn(
                          "font-mono text-[.75rem] text-ink-muted",
                          loadingPlaceholder(loadingDetail, "label", "long"),
                        )}
                        data-placeholder={loadingDetail ? "label" : undefined}
                        data-placeholder-width="long"
                      >
                        Submitted by{" "}
                        {item.submittedBy?.person?.fullName ??
                          item.submittedBy?.email ??
                          "Unknown member"}
                      </span>
                    </div>
                    <h2
                      className={cn(
                        "m-0 font-sans text-[clamp(1.75rem,2.7vw,2.45rem)] leading-[1.08] [overflow-wrap:anywhere]",
                        loadingPlaceholder(loadingDetail, "text", "full"),
                      )}
                      data-placeholder={loadingDetail ? "text" : undefined}
                      data-placeholder-width="full"
                    >
                      {researchLabel(item)}
                    </h2>
                    {item.summary ? (
                      <p
                        className={cn(
                          "m-0 text-[.95rem] leading-[1.55] text-ink-muted",
                          loadingPlaceholder(loadingDetail, "text", "full"),
                        )}
                        data-placeholder={loadingDetail ? "text" : undefined}
                        data-placeholder-width="full"
                      >
                        {item.summary}
                      </p>
                    ) : null}
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge
                        loading={loadingDetail}
                        tone={
                          item.reviewStatus === "PUBLISHED"
                            ? "success"
                            : item.reviewStatus === "REJECTED"
                              ? "error"
                              : "warning"
                        }
                      >
                        {item.reviewStatus.replaceAll("_", " ").toLowerCase()}
                      </Badge>
                      {!loadingDetail
                        ? issuesFor(item).map((issue, index) => (
                            <SemanticStatus
                              key={`${issue.code ?? issue.message}-${index}`}
                              tone={issue.tone ?? "pending"}
                            >
                              {issue.message}
                            </SemanticStatus>
                          ))
                        : null}
                      <ButtonControl
                        compact
                        disabled={loadingDetail || editSaving}
                        loading={loadingDetail}
                        onClick={() => {
                          if (editing && editDirty) { setDiscardEditor(true); return; }
                          setEditDirty(false);
                          // Keep an open draft mounted if live refresh removes its queue row.
                          setFocusedItem(item);
                          setEditSnapshot(item);
                          setEditingId((current) =>
                            current === item.id ? undefined : item.id,
                          );
                        }}
                        variant="secondary"
                      >
                        {editing ? "Cancel" : "Edit record"}
                      </ButtonControl>
                    </div>
                  </header>
                  {editing ? (
                    <ResearchRecordEditor
                      item={editSnapshot ?? item}
                      submitters={submitters}
                      onDirtyChange={setEditDirty}
                      onSubmit={saveRecordEdit}
                      saving={editSaving}
                    />
                  ) : null}
                  <section
                    className="relative mx-[-1.25rem] grid w-[calc(100%+2.5rem)] gap-4 border-t border-line bg-transparent p-[clamp(1rem,2vw,1.35rem)]"
                    aria-label="Source discovery"
                  >
                    <div className="flex items-center justify-between gap-4 max-[640px]:flex-col max-[640px]:items-start">
                      <div className="flex items-center gap-[.7rem]">
                        <Badge
                          dot
                          loading={loadingDetail}
                          tone={
                            !item.canonicalUrl
                              ? "warning"
                              : sourceTone(item.sourceSnapshot?.status)
                          }
                        >
                          {!item.canonicalUrl
                            ? "not provided"
                            : (item.sourceSnapshot?.status.toLowerCase() ??
                              "not checked")}
                        </Badge>
                        <h3
                          className={cn(
                            "font-sans text-[clamp(1.15rem,1.7vw,1.35rem)] leading-[1.2]",
                            loadingPlaceholder(loadingDetail, "text", "medium"),
                          )}
                          data-placeholder={loadingDetail ? "text" : undefined}
                          data-placeholder-width="medium"
                        >
                          Canonical source evidence
                        </h3>
                      </div>
                      <ButtonControl
                        compact
                        disabled={sourcePending || !item.canonicalUrl}
                        loading={loadingDetail}
                        onClick={() => void rediscover(item.id)}
                        variant="secondary"
                      >
                        {!item.canonicalUrl
                          ? "No source URL"
                          : sourcePending
                             ? "Retry source check"
                            : item.sourceSnapshot
                              ? "Check source again"
                              : "Check source"}
                      </ButtonControl>
                    </div>
                    {!loadingDetail && item.canonicalUrl ? (
                      <ReviewActions
                        actions={[{
                          status: "VERIFIED", label: "Verify source manually", tone: "secondary",
                          disabled: editDirty,
                          requiresNote: true, notePlaceholder: "Describe the source and authors you checked.",
                          confirmTitle: "Complete source verification?", confirmLabel: "Mark source verified",
                          confirmDescription: "This records your verification and supersedes any pending automated source check. Contributor matches and publication are reviewed separately.",
                        }]}
                        noteLabel="Source evidence"
                        onSubmit={async ({ note }) => {
                          await apiRequest(`/research/${item.id}/verify-source`, {
                            method: "POST", headers: { "content-type": "application/json" },
                            body: JSON.stringify({ note, expectedAutomationVersion: item.automationVersion }),
                          });
                          await refreshResearchItem(item.id);
                        }}
                        successTitle="Source verified" successBody={() => "Your source verification was recorded. You can now resolve authors and publish."}
                      />
                    ) : null}
                    {item.sourceSnapshot?.updatedAt ? <p className="m-0 text-xs text-ink-muted">Last source activity: {new Date(item.sourceSnapshot.updatedAt).toLocaleString()}</p> : null}
                    {item.sourceSnapshot?.metadata?.manuallyVerified ? <SemanticStatus tone="success">Manually verified: {item.sourceSnapshot.metadata.note}</SemanticStatus> : null}
                    {loadingDetail ? (
                      <span
                        className={loadingPlaceholder(true, "label", "long")}
                        data-placeholder="label"
                        data-placeholder-width="long"
                      />
                    ) : !item.canonicalUrl ? (
                      <SemanticStatus tone="warning">
                        No canonical source URL was submitted. Contributor
                        relationships can still be verified manually.
                      </SemanticStatus>
                    ) : !item.sourceSnapshot ? (
                      <SemanticStatus tone="info">
                        The canonical source has not been checked yet.
                      </SemanticStatus>
                    ) : item.sourceSnapshot.status === "PENDING" ? (
                      <SemanticStatus tone="pending">
                        Canonical source metadata is being checked.
                      </SemanticStatus>
                    ) : item.sourceSnapshot.status === "FAILED" ? (
                      <SemanticStatus tone="error">
                        The canonical source check failed. Check the source URL
                        or try again.
                      </SemanticStatus>
                    ) : item.sourceSnapshot.status === "UNAVAILABLE" ? (
                      <SemanticStatus tone="warning">
                        No machine-readable source metadata was available.
                        Manual review is still possible.
                      </SemanticStatus>
                    ) : sourceAuthorsDiffer(item) ? (
                      <div className="grid gap-[.65rem]">
                        <SemanticStatus tone="warning">
                          Source metadata differs
                        </SemanticStatus>
                        <div className="flex flex-wrap gap-[.45rem] text-[.75rem] text-ink-muted">
                          {item.sourceSnapshot.metadata?.authors?.map(
                            ({ name }, index) => (
                              <span key={name}>
                                {index ? ` · ${name}` : name}
                              </span>
                            ),
                          )}
                        </div>
                      </div>
                    ) : item.sourceSnapshot.metadata?.authors?.length ? null : (
                      <SemanticStatus tone="warning">
                        No machine-readable contributor metadata was found.
                        Manual linking remains available.
                      </SemanticStatus>
                    )}
                  </section>
                  <section
                    className="relative mx-[-1.25rem] grid w-[calc(100%+2.5rem)] gap-4 border-t border-line bg-transparent p-[clamp(1rem,2vw,1.35rem)]"
                    aria-label="Contributor verification"
                  >
                    <div className="flex items-center justify-between gap-4">
                      <h3
                        className={cn(
                          "font-sans text-[clamp(1.15rem,1.7vw,1.35rem)] leading-[1.2]",
                          loadingPlaceholder(loadingDetail, "text", "medium"),
                        )}
                        data-placeholder={loadingDetail ? "text" : undefined}
                        data-placeholder-width="medium"
                      >
                        Contributor relationships
                      </h3>
                      <span
                        className={cn(
                          "font-mono text-[.75rem] text-ink-muted",
                          loadingPlaceholder(loadingDetail, "label", "medium"),
                        )}
                        data-placeholder={loadingDetail ? "label" : undefined}
                        data-placeholder-width="medium"
                      >
                        {
                          item.contributors.filter(({ person }) => person)
                            .length
                        }
                        /{item.contributors.length} linked
                      </span>
                    </div>
                    {item.contributors.map((contributor) => {
                      const key = `${item.id}:${contributor.sortOrder}`;
                      const proposals = contributor.matches
                        .filter(({ status }) => status === "PROPOSED")
                        .sort(
                          (left, right) =>
                            (right.confidence ?? 0) - (left.confidence ?? 0),
                        );
                      const suggested = proposals[0];
                      const selectedPersonId =
                        manualPeople[key] ??
                        contributor.person?.id ??
                        suggested?.person.id ??
                        "";
                      const selectedMatch = contributor.matches.find(
                        ({ person }) => person.id === selectedPersonId,
                      );
                      const verifiedCurrent = Boolean(
                        contributor.person &&
                        contributor.person.id === selectedPersonId,
                      );
                      const metadata = selectedMatch
                        ? `${selectedMatch.status === "REJECTED" ? "Previously rejected · " : ""}${proposalReason(selectedMatch)}${selectedMatch.confidence !== null ? ` · ${Math.round(selectedMatch.confidence * 100)}% match` : ""}`
                        : selectedPersonId
                          ? "Manual selection · no automatic confidence score"
                          : "No reliable registered-person match was found";
                      const selectedIsSuggestion =
                        selectedMatch?.status === "PROPOSED";
                      const selectedWasRejected =
                        selectedMatch?.status === "REJECTED";
                      const selectedManually = Boolean(
                        selectedPersonId && !selectedMatch && !verifiedCurrent,
                      );
                      const statusTone: BadgeTone = verifiedCurrent
                        ? "success"
                        : selectedIsSuggestion
                          ? "warning"
                          : selectedWasRejected
                            ? "error"
                            : selectedManually
                              ? "info"
                              : "neutral";
                      const statusLabel = verifiedCurrent
                        ? "Verified"
                        : selectedIsSuggestion
                          ? "Suggested"
                          : selectedWasRejected
                            ? "Previously rejected"
                            : selectedManually
                              ? "Manual"
                              : "Unmatched";
                      const rejectMatch = selectedIsSuggestion
                        ? selectedMatch
                        : undefined;
                      const verificationBusy =
                        relationBusy.has(key) ||
                        relationBusy.has(selectedMatch?.id ?? "");
                      return (
                        <article
                          className="grid min-w-0 gap-[.65rem] border-t border-line py-4 first:border-t-0 first:pt-0"
                          key={key}
                        >
                          <div className="grid min-w-0 grid-cols-[minmax(180px,.72fr)_minmax(260px,1fr)_auto] items-center gap-[.65rem] max-[720px]:grid-cols-1">
                            <strong
                              className={cn(
                                "min-w-0 [overflow-wrap:anywhere]",
                                loadingPlaceholder(
                                  loadingDetail,
                                  "text",
                                  "long",
                                ),
                              )}
                              data-placeholder={
                                loadingDetail ? "text" : undefined
                              }
                              data-placeholder-width="long"
                            >
                              {contributor.displayName}
                            </strong>
                            <SearchableSelect
                              ariaLabel={`Match ${contributor.displayName} to a registered person`}
                              disabled={loadingDetail}
                              placeholderLoading={loadingDetail}
                              onValueChange={(value) =>
                                setManualPeople((current) => ({
                                  ...current,
                                  [key]: value,
                                }))
                              }
                              options={people.map((person) => {
                                const match = contributor.matches.find(
                                  ({ person: matchedPerson }) =>
                                    matchedPerson.id === person.id,
                                );
                                return {
                                  label: person.fullName,
                                  value: person.id,
                                  ...(match
                                    ? {
                                        description: `${match.status === "REJECTED" ? "Previously rejected · " : match.status === "VERIFIED" ? "Verified · " : ""}${proposalReason(match)}${match.confidence !== null ? ` · ${Math.round(match.confidence * 100)}% match` : ""}`,
                                      }
                                    : {}),
                                };
                              })}
                              placeholder="Search registered person…"
                              searchPlaceholder="Search people…"
                              value={selectedPersonId}
                            />
                            <div className="flex items-center justify-end gap-2 max-[720px]:justify-start">
                              <ButtonControl
                                compact
                                disabled={
                                  sourcePending ||
                                  !selectedPersonId ||
                                  verifiedCurrent ||
                                  verificationBusy
                                }
                                loading={loadingDetail}
                                onClick={() =>
                                  void verifyContributor(
                                    item.id,
                                    contributor.sortOrder,
                                    selectedPersonId,
                                    selectedMatch,
                                  )
                                }
                                variant="primary"
                              >
                                {verificationBusy
                                  ? "Verifying…"
                                  : verifiedCurrent
                                    ? "Verified"
                                    : "Verify"}
                              </ButtonControl>
                              {rejectMatch ? (
                                <ReviewActions
                                  className="gap-0"
                                  actions={[
                                    {
                                      confirmDescription: `Reject ${rejectMatch.person.fullName} as the selected suggested match for ${contributor.displayName}.`,
                                      confirmLabel: "Reject suggestion",
                                      confirmTitle:
                                        "Reject this contributor match?",
                                      disabled: sourcePending || relationBusy.has(
                                        rejectMatch.id,
                                      ),
                                      label: "Reject",
                                      notePlaceholder:
                                        "Optional note about why this suggested contributor match is incorrect.",
                                      requiresNote:
                                        rejectMatch.source === "USER_CLAIM",
                                      status: "REJECTED",
                                      tone: "secondary",
                                    },
                                  ]}
                                  onSubmit={(decision) =>
                                    reviewMatch(
                                      item.id,
                                      rejectMatch.id,
                                      decision,
                                    )
                                  }
                                  successBody={() =>
                                    "The suggested contributor match was rejected."
                                  }
                                  successTitle="Contributor suggestion rejected"
                                />
                              ) : null}
                            </div>
                          </div>
                          <div className="grid min-w-0 grid-cols-[minmax(180px,.72fr)_minmax(0,1fr)] items-start gap-[.65rem] max-[720px]:grid-cols-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge
                                dot
                                loading={loadingDetail}
                                tone={statusTone}
                              >
                                {statusLabel}
                              </Badge>
                              <Badge loading={loadingDetail} tone="neutral">
                                Author
                              </Badge>
                            </div>
                            <div className="grid min-w-0 gap-1">
                              <span
                                className={cn(
                                  "text-[.78rem] leading-[1.45]",
                                  loadingPlaceholder(
                                    loadingDetail,
                                    "text",
                                    "long",
                                  ),
                                  selectedMatch?.confidence === 1
                                    ? "text-success"
                                    : selectedMatch
                                      ? "text-warning"
                                      : "text-ink-muted",
                                )}
                                data-placeholder={
                                  loadingDetail ? "text" : undefined
                                }
                                data-placeholder-width="long"
                              >
                                {metadata}
                              </span>
                            </div>
                          </div>
                        </article>
                      );
                    })}
                  </section>
                  {(item.canonicalUrl ?? item.legacyUrl) ? (
                    <ButtonAnchor
                      className="justify-self-start"
                      href={
                        loadingDetail
                          ? "#"
                          : (item.canonicalUrl ?? item.legacyUrl ?? undefined)
                      }
                      loading={loadingDetail}
                      rel="noreferrer"
                      target="_blank"
                      variant="secondary"
                    >
                      {item.canonicalUrl
                        ? "Open canonical source"
                        : "Open import source"}
                    </ButtonAnchor>
                  ) : (
                    <SemanticStatus loading={loadingDetail} tone="warning">
                      No external source URL was provided. Manual source
                      verification is required.
                    </SemanticStatus>
                  )}
                  {error ? (
                    <p className="m-0 flex items-center gap-[.45rem] text-[.82rem] leading-[1.5] text-ink-muted rounded-panel bg-danger-soft p-[.8rem] text-danger">
                      {error}
                    </p>
                  ) : null}
                  {item.reviewStatus === "PUBLISHED" ||
                  item.reviewStatus === "REJECTED" ? (
                    <ReviewActions
                      loading={loadingDetail}
                      actions={[
                        {
                          confirmDescription:
                            "The public/rejected decision is retained in history and the record returns to the manual verification queue.",
                          confirmLabel: "Reopen record",
                          confirmTitle: "Reopen this research record?",
                          disabled: editDirty,
                          label: "Reopen for review",
                          notePlaceholder:
                            "Explain why this record needs to be reviewed again.",
                          requiresNote: true,
                          status: "NEEDS_REVIEW",
                          tone: "secondary",
                        },
                      ]}
                      onError={(requestError) =>
                        item && captureItemError(item.id, requestError)
                      }
                      onSubmit={
                        loadingDetail ? () => Promise.resolve() : decide
                      }
                      onSuccess={() => item && actionIssues.clearOne(item.id)}
                      successBody={() =>
                        "The record was reopened for manual review."
                      }
                      successTitle="Research record reopened"
                    />
                  ) : (
                    <ReviewActions
                      loading={loadingDetail}
                      actions={[
                        {
                          confirmDescription:
                            "The record becomes public and a verified paper may trigger rank promotion.",
                          confirmLabel: "Publish verified record",
                          confirmTitle: "Publish this research record?",
                          disabled: editDirty || ownerMissing || !item.contributors.length || sourcePending || hasProposedMatches,
                          label: ownerMissing
                            ? "Select Submitted by before publishing"
                            : !item.contributors.length ? "Add authors before publishing" : sourcePending
                            ? "Source check in progress"
                            : hasProposedMatches
                              ? "Resolve contributor matches"
                              : "Publish",
                          status: "PUBLISHED",
                          tone: "primary",
                        },
                        {
                          confirmDescription:
                            "The submission returns to the member with your reviewer note.",
                          confirmLabel: "Request changes",
                          confirmTitle: "Send this back for changes?",
                          disabled: editDirty,
                          label: "Add review",
                          notePlaceholder:
                            "Explain what must change before this can be approved.",
                          pendingLabel: "Send review",
                          requiresNote: true,
                          status: "CHANGES_REQUESTED",
                          tone: "secondary",
                        },
                        {
                          confirmDescription:
                            "The submission leaves the active queue as rejected.",
                          confirmLabel: "Reject submission",
                          confirmTitle: "Reject this research record?",
                          disabled: editDirty,
                          label: "Reject",
                          notePlaceholder:
                            "Explain why this submission was rejected.",
                          requiresNote: true,
                          status: "REJECTED",
                          tone: "danger",
                        },
                      ]}
                      onError={(requestError) =>
                        item && captureItemError(item.id, requestError)
                      }
                      onSubmit={
                        loadingDetail ? () => Promise.resolve() : decide
                      }
                      onSuccess={() => item && actionIssues.clearOne(item.id)}
                      successBody={(status) =>
                        `The research record was moved to ${status.replaceAll("_", " ").toLowerCase()}.`
                      }
                      successTitle="Research review saved"
                    />
                  )}
                </>
              ) : (
                <p className="m-0 text-[.82rem] leading-[1.5] text-ink-muted">
                  {missingId && missingId === selected
                    ? "This research record is no longer available. Choose another record from the queue."
                    : "Select a research submission."}
                </p>
              )}
            </>
          }
        />
      )}
    </div>
  );
}

function ResearchRecordEditor({
  item,
  submitters,
  onDirtyChange,
  onSubmit,
  saving,
}: {
  item: ReviewResearch;
  submitters: LinkablePerson[];
  onDirtyChange: (dirty: boolean) => void;
  onSubmit: (event: SyntheticEvent<HTMLFormElement, SubmitEvent>) => void;
  saving: boolean;
}) {
  const [ownerId, setOwnerId] = useState(item.submittedBy?.isSystemAccount ? "" : item.submittedBy?.person?.id ?? "");
  const [dirty, setDirty] = useState(false);
  const [sourceChanged, setSourceChanged] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const initial = useRef<string | undefined>(undefined);
  const checkChanges = useCallback(() => {
    if (!formRef.current) return;
    const form = new FormData(formRef.current);
    const serialized = JSON.stringify([...form.entries()]);
    if (initial.current === undefined) initial.current = serialized;
    const changed = initial.current !== serialized;
    setDirty(changed);
    onDirtyChange(changed);
    setSourceChanged(
      String(form.get("title") ?? "").trim() !== (item.title ?? "") ||
      form.get("canonicalUrl") !== (item.canonicalUrl ?? "") ||
      String(form.get("doi") ?? "").trim() !== (item.paper?.doi ?? "") ||
      String(form.get("contributors") ?? "").split("\n").map((name) => name.trim()).filter(Boolean).join("\n") !== item.contributors.map(({ displayName }) => displayName).join("\n"),
    );
  }, [item, onDirtyChange]);
  useEffect(() => { checkChanges(); }, [ownerId, checkChanges]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  return (
    <form
      ref={formRef}
      onChange={checkChanges}
      className="grid gap-4 border border-line-strong bg-canvas p-[clamp(1rem,2vw,1.35rem)]"
      onSubmit={onSubmit}
    >
      <fieldset disabled={saving} className="contents">
      <div className="grid gap-1">
        <span className="font-mono text-[.62rem] uppercase tracking-[.08em] text-brand">
          Record editor
        </span>
        <strong className="font-sans text-[1.2rem] font-normal">
          Edit research record
        </strong>
        <p className="m-0 text-[.78rem] leading-[1.5] text-ink-muted">
          Save corrections without repeating completed checks. Changing the title, source URL, DOI or authors restarts verification.
        </p>
        {dirty ? <SemanticStatus tone="warning">Unsaved changes</SemanticStatus> : null}
        {sourceChanged ? <SemanticStatus tone="warning">Saving these changes restarts source verification{item.reviewStatus === "PUBLISHED" ? " and returns this published record to review" : ""}.</SemanticStatus> : null}
      </div>
      <div className="grid grid-cols-2 gap-4 max-[700px]:grid-cols-1">
        <FormField className="col-span-full" label="Submitted by">
          <SearchableSelect
            ariaLabel="Submitted by"
            disabled={saving}
            options={submitters.map(({ id, fullName }) => ({ label: fullName, value: id }))}
            onValueChange={setOwnerId}
            value={ownerId}
            placeholder="Select the person this research belongs to…"
          />
          <InputControl
            aria-hidden="true"
            className="sr-only"
            name="submitterPersonId"
            readOnly
            tabIndex={-1}
            value={ownerId}
          />
          {!ownerId ? <SemanticStatus tone="warning">Select a registered person before saving.</SemanticStatus> : null}
        </FormField>
        <FormField
          className="col-span-full"
          htmlFor="review-edit-title"
          label="Title"
        >
          <InputControl
            defaultValue={item.title ?? ""}
            id="review-edit-title"
            name="title"
            required
          />
        </FormField>
        <FormField
          className="col-span-full"
          htmlFor="review-edit-url"
          label="Canonical URL"
        >
          <InputControl
            defaultValue={item.canonicalUrl ?? ""}
            id="review-edit-url"
            name="canonicalUrl"
            required
            type="url"
          />
        </FormField>
        <FormField
          className="col-span-full"
          htmlFor="review-edit-contributors"
          label="Authors"
        >
          <TextareaControl
            defaultValue={item.contributors
              .map(({ displayName }) => displayName)
              .join("\n")}
            id="review-edit-contributors"
            name="contributors"
            rows={2}
          />
          <p className="m-0 text-xs text-ink-muted">One author per line, in publication order. Incomplete records can be saved; authors are required before publication.</p>
        </FormField>
        <FormField
          className="col-span-full"
          htmlFor="review-edit-summary"
          label="Summary"
        >
          <TextareaControl
            defaultValue={item.summary ?? ""}
            id="review-edit-summary"
            name="summary"
            rows={3}
          />
        </FormField>
        {item.type === "PAPER" ? (
          <>
            <FormField htmlFor="review-edit-doi" label="DOI">
              <InputControl
                defaultValue={item.paper?.doi ?? ""}
                id="review-edit-doi"
                name="doi"
              />
            </FormField>
            <FormField htmlFor="review-edit-year" label="Year">
              <InputControl
                defaultValue={item.paper?.year?.toString() ?? ""}
                id="review-edit-year"
                max="2200"
                min="1900"
                name="year"
                type="number"
              />
            </FormField>
            <FormField htmlFor="review-edit-venue" label="Venue">
              <InputControl
                defaultValue={item.paper?.venue ?? ""}
                id="review-edit-venue"
                name="venue"
              />
            </FormField>
            <FormField
              htmlFor="review-edit-publication-type"
              label="Publication type"
            >
              <InputControl
                defaultValue={item.paper?.publicationType ?? ""}
                id="review-edit-publication-type"
                name="publicationType"
              />
            </FormField>
            <FormField
              className="col-span-full"
              htmlFor="review-edit-citation"
              label="Citation"
            >
              <TextareaControl
                defaultValue={item.paper?.citation ?? ""}
                id="review-edit-citation"
                name="citation"
                rows={3}
              />
            </FormField>
          </>
        ) : (
          <>
            <FormField htmlFor="review-edit-version" label="Version">
              <InputControl
                defaultValue={item.dataset?.version ?? ""}
                id="review-edit-version"
                name="version"
              />
            </FormField>
            <FormField htmlFor="review-edit-license" label="License">
              <InputControl
                defaultValue={item.dataset?.license ?? ""}
                id="review-edit-license"
                name="license"
              />
            </FormField>
            <FormField htmlFor="review-edit-modality" label="Modality">
              <InputControl
                defaultValue={item.dataset?.modality ?? ""}
                id="review-edit-modality"
                name="modality"
              />
            </FormField>
            <FormField
              className="col-span-full"
              htmlFor="review-edit-access"
              label="Access notes"
            >
              <TextareaControl
                defaultValue={item.dataset?.accessNotes ?? ""}
                id="review-edit-access"
                name="accessNotes"
                rows={3}
              />
            </FormField>
          </>
        )}
      </div>
      <div className="flex justify-end">
        <ButtonControl disabled={saving || !dirty || !ownerId} type="submit" variant="primary">
          Save changes
        </ButtonControl>
      </div>
      </fieldset>
    </form>
  );
}

function researchBulkStatuses(
  item: ReviewResearch,
  relationBusy: Set<string>,
): ResearchDecision[] {
  if (item.reviewStatus === "PUBLISHED" || item.reviewStatus === "REJECTED") {
    return ["NEEDS_REVIEW"];
  }
  if (
    item.reviewStatus !== "NEEDS_REVIEW" &&
    item.reviewStatus !== "CHANGES_REQUESTED"
  ) {
    return [];
  }
  const statuses: ResearchDecision[] = ["CHANGES_REQUESTED", "REJECTED"];
  const sourcePending =
    item.sourceSnapshot?.status === "PENDING" ||
    relationBusy.has(`discover:${item.id}`);
  const hasProposedMatches = item.contributors.some((contributor) =>
    contributor.matches.some((match) => match.status === "PROPOSED"),
  );
  if (!sourcePending && !hasProposedMatches && item.contributors.length && item.submittedBy?.person && !item.submittedBy.isSystemAccount) statuses.unshift("PUBLISHED");
  return statuses;
}

function commonResearchBulkStatuses(
  items: ReviewResearch[],
  relationBusy: Set<string>,
): ResearchDecision[] {
  if (!items.length) return [];
  const [first, ...rest] = items.map((item) =>
    researchBulkStatuses(item, relationBusy),
  );
  return first.filter((status) =>
    rest.every((statuses) => statuses.includes(status)),
  );
}

function researchBulkActions(
  statuses: ResearchDecision[],
  count: number,
): Array<ReviewAction<ResearchDecision>> {
  const actions: Record<ResearchDecision, ReviewAction<ResearchDecision>> = {
    PUBLISHED: {
      confirmDescription: `Publish the ${count} selected paper/dataset record${count === 1 ? "" : "s"}. This action is only offered when every selected record has cleared source and contributor guards.`,
      confirmLabel: "Publish selected",
      confirmTitle: "Publish selected research records?",
      label: "Publish selected",
      status: "PUBLISHED",
      tone: "primary",
    },
    CHANGES_REQUESTED: {
      confirmDescription: `Return the ${count} selected research record${count === 1 ? "" : "s"} for changes with the same reviewer note.`,
      confirmLabel: "Request changes",
      confirmTitle: "Request changes for selected records?",
      label: "Add review",
      notePlaceholder:
        "Explain what must change before these records can be approved.",
      requiresNote: true,
      status: "CHANGES_REQUESTED",
      tone: "secondary",
    },
    REJECTED: {
      confirmDescription: `Reject the ${count} selected research record${count === 1 ? "" : "s"} with the same reviewer note.`,
      confirmLabel: "Reject selected",
      confirmTitle: "Reject selected research records?",
      label: "Reject selected",
      notePlaceholder: "Explain why these submissions were rejected.",
      requiresNote: true,
      status: "REJECTED",
      tone: "danger",
    },
    NEEDS_REVIEW: {
      confirmDescription: `Reopen the ${count} selected published/rejected research record${count === 1 ? "" : "s"} for manual review.`,
      confirmLabel: "Reopen selected",
      confirmTitle: "Reopen selected research records?",
      label: "Reopen selected",
      notePlaceholder: "Explain why these records need to be reviewed again.",
      requiresNote: true,
      status: "NEEDS_REVIEW",
      tone: "secondary",
    },
  };
  return statuses.map((status) => actions[status]);
}

function sourceTone(status: SourceStatus | undefined): BadgeTone {
  if (!status) return "warning";
  if (status === "FETCHED") return "success";
  if (status === "PENDING") return "warning";
  if (status === "UNAVAILABLE") return "warning";
  return "error";
}

function sourceAuthorsDiffer(item: ReviewResearch): boolean {
  const source =
    item.sourceSnapshot?.metadata?.authors?.map(({ name }) =>
      normalizeName(name),
    ) ?? [];
  const contributors = item.contributors.map(({ displayName }) =>
    normalizeName(displayName),
  );
  return (
    source.length > 0 &&
    (source.length !== contributors.length ||
      source.some((name, index) => name !== contributors[index]))
  );
}

function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLocaleLowerCase();
}
