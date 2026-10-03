export type ResearchReviewStatus =
  | "NEEDS_REVIEW"
  | "CHANGES_REQUESTED"
  | "PUBLISHED"
  | "REJECTED";

export type ResearchSourceStatus =
  | "PENDING"
  | "FETCHED"
  | "UNAVAILABLE"
  | "FAILED";

export interface ResearchLiveEvent {
  scope: "research";
  kind: "source" | "status";
  researchItemId: string;
  reviewStatus?: ResearchReviewStatus;
  sourceStatus?: ResearchSourceStatus;
}

export interface ResearchLiveEventPatch {
  reviewStatus?: ResearchReviewStatus;
  sourceStatus?: ResearchSourceStatus;
}

export interface ResearchLiveReviewState {
  id: string;
  reviewStatus: ResearchReviewStatus;
  sourceSnapshot: {
    status: ResearchSourceStatus;
    failureReason: string | null;
    fetchedAt: string | null;
    metadata: { authors?: Array<{ name: string; orcid?: string }> } | null;
  } | null;
}

function isReviewStatus(value: unknown): value is ResearchReviewStatus {
  return (
    value === "NEEDS_REVIEW" ||
    value === "CHANGES_REQUESTED" ||
    value === "PUBLISHED" ||
    value === "REJECTED"
  );
}

function isSourceStatus(value: unknown): value is ResearchSourceStatus {
  return (
    value === "PENDING" ||
    value === "FETCHED" ||
    value === "UNAVAILABLE" ||
    value === "FAILED"
  );
}

export function parseResearchLiveEvent(value: unknown): ResearchLiveEvent | null {
  if (!value || Array.isArray(value) || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (
    record.scope !== "research" ||
    (record.kind !== "source" && record.kind !== "status") ||
    typeof record.researchItemId !== "string" ||
    !record.researchItemId
  ) {
    return null;
  }

  if (record.kind === "source") {
    return isSourceStatus(record.sourceStatus)
      ? {
          kind: "source",
          scope: "research",
          researchItemId: record.researchItemId,
          sourceStatus: record.sourceStatus,
        }
      : null;
  }

  return isReviewStatus(record.reviewStatus)
    ? {
        kind: "status",
        scope: "research",
        researchItemId: record.researchItemId,
        reviewStatus: record.reviewStatus,
      }
    : null;
}

export function researchLiveEventPatch(
  event: ResearchLiveEvent,
): ResearchLiveEventPatch {
  return event.kind === "source"
    ? { sourceStatus: event.sourceStatus }
    : { reviewStatus: event.reviewStatus };
}

export function applyResearchLiveEvent(
  item: ResearchLiveReviewState,
  event: ResearchLiveEvent,
): ResearchLiveReviewState {
  if (item.id !== event.researchItemId) return item;
  const patch = researchLiveEventPatch(event);
  return {
    ...item,
    ...(patch.reviewStatus ? { reviewStatus: patch.reviewStatus } : {}),
    ...(patch.sourceStatus
      ? {
          sourceSnapshot: {
            ...(item.sourceSnapshot ?? {
              failureReason: null,
              fetchedAt: null,
              metadata: null,
            }),
            status: patch.sourceStatus,
          },
        }
      : {}),
  };
}
