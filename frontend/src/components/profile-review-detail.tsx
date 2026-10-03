"use client";

import { cn } from "@/lib/cn";
import { loadingPlaceholder } from "@/lib/loading-style";
import Image from "next/image";
import { useEffect, useState } from "react";
import { API_URL } from "@/lib/api";
import { ApiRequestError, apiRequest } from "@/lib/client-api";
import type { ProfileEditPayload, ProfileEditRequest } from "@/lib/types";
import { ReviewActions } from "@/components/review-actions";
import { StatePanel } from "@/components/state-panel";
import { useNotifications } from "@/components/notification-provider";
import { useAuth } from "@/components/auth-provider";
import { profileValuesEqual } from "@/lib/profile-changes";
import {
  ReviewIssueStamp,
  SemanticStatus,
} from "@/components/ui/semantic-status";
import type { ReviewIssue } from "@/lib/review-issues";

const EMPTY_PROFILE_PAYLOAD: ProfileEditPayload = {
  fullName: "",
  headline: "",
  biography: "",
  phone: "",
  contactAddress: "",
  expertise: [],
  links: [],
  sections: [],
  removeAvatar: false,
};

/**
 * The open profile change request inside the review split. `id` is undefined
 * while the queue's first load is pending (renders the loading structure).
 */
export function ProfileReviewDetail({
  id,
  onDecided,
}: {
  id: string | undefined;
  onDecided: () => void;
}) {
  const { refreshUnreadCount } = useNotifications();
  const { user } = useAuth();
  const [request, setRequest] = useState<ProfileEditRequest>();
  const [message, setMessage] = useState<string>();
  const [actionIssues, setActionIssues] = useState<ReviewIssue[]>([]);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    if (!id) return;
    let active = true;
    void apiRequest<ProfileEditRequest>(`/profile-reviews/${id}`, {
      method: "GET",
    })
      .then((nextRequest) => {
        if (active) setRequest(nextRequest);
      })
      .catch((caught: unknown) => {
        if (active) {
          setMessage(
            caught instanceof Error
              ? caught.message
              : "Unable to load request.",
          );
        }
      });
    return () => {
      active = false;
    };
  }, [id, reload]);

  function captureReviewError(error: ApiRequestError) {
    setActionIssues(
      error.issues.length
        ? error.issues
        : [
            {
              code: "PROFILE_REVIEW_FAILED",
              itemId: request?.id,
              message: "This profile decision could not be saved.",
              tone: "error",
            },
          ],
    );
  }

  async function decide({
    note,
    status,
  }: {
    note?: string;
    status: "APPROVED" | "REJECTED";
  }) {
    if (!request) return;
    setMessage(undefined);
    await apiRequest(`/profile-reviews/${request.id}/review`, {
      body: JSON.stringify({
        ...(note ? { note } : {}),
        revision: request.revision,
        status,
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    void refreshUnreadCount().catch(() => undefined);
    onDecided();
  }

  if (!request && message)
    return (
      <StatePanel
        action={{
          label: "Retry",
          onClick: () => setReload((value) => value + 1),
        }}
        body="The review record could not be retrieved."
        title={message}
        variant="error"
      />
    );

  const loading = !request;
  const proposed = request?.payload ?? EMPTY_PROFILE_PAYLOAD;
  const currentPerson = request?.person;
  const current: ProfileEditPayload = currentPerson
    ? {
        fullName: currentPerson.fullName,
        headline: currentPerson.headline,
        biography: currentPerson.biography,
        phone: currentPerson.phone,
        contactAddress: currentPerson.contactAddress,
        expertise: currentPerson.expertise,
        links: (currentPerson.links ?? []).map(({ label, type, url }) => ({
          label,
          type,
          url,
        })),
        sections: (currentPerson.profileSections ?? []).map(
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
        removeAvatar: false,
      }
    : EMPTY_PROFILE_PAYLOAD;
  const proposedAvatar = request
    ? proposed.removeAvatar
      ? null
      : (request.avatarAsset?.id ?? currentPerson?.avatar?.id)
    : undefined;
  const reviewIssues = [...(request?.reviewIssues ?? []), ...actionIssues];
  const blockingIssue = reviewIssues.find(
    ({ tone }) => (tone ?? "error") === "error",
  );
  const selfReview = Boolean(
    user?.person?.id && request?.person.id === user.person.id,
  );
  const selfReviewReason = "You cannot review your own profile change.";

  return (
    <div className="grid gap-4" data-loading={loading || undefined}>
      <section className="relative border-b border-line pb-5">
        <ReviewIssueStamp issue={reviewIssues[0]} />
        <div>
          <p className="m-0 mb-4 font-[var(--font-sans)] text-[.75rem] font-extrabold uppercase tracking-[.12em] text-brand">
            Latest request only
          </p>
          <h2
            className={cn(
              "font-sans text-[clamp(1.6rem,3vw,2.4rem)] font-medium leading-[1.08]",
              loadingPlaceholder(loading, "text", "long"),
            )}
            data-placeholder="text"
            data-placeholder-width="long"
          >
            {currentPerson?.fullName ?? "Loading member profile"}
          </h2>
          <div className="mt-2">
            {loading ? (
              <span
                className={cn(
                  "block h-5 w-28",
                  loadingPlaceholder(true, "label", "medium"),
                )}
                data-placeholder="label"
                data-placeholder-width="medium"
              />
            ) : request ? (
              <SemanticStatus
                loading={loading}
                tone={
                  request.status === "APPROVED"
                    ? "success"
                    : request.status === "REJECTED"
                      ? "error"
                      : "pending"
                }
              >
                {request.status.replaceAll("_", " ").toLowerCase()}
              </SemanticStatus>
            ) : null}
          </div>
          {reviewIssues.length ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {reviewIssues.map((issue, index) => (
                <SemanticStatus
                  key={`${issue.code ?? issue.message}-${index}`}
                  loading={loading}
                  tone={issue.tone ?? "error"}
                >
                  {issue.message}
                </SemanticStatus>
              ))}
            </div>
          ) : null}
        </div>
      </section>

      <ProfileDiff
        current={current}
        currentAvatar={currentPerson?.avatar?.id}
        loading={loading}
        proposed={proposed}
        proposedAvatar={proposedAvatar}
      />

      {loading || request?.status === "NEEDS_REVIEW" ? (
        <section className="grid gap-4 border-t border-line pt-5">
          <ReviewActions
            loading={loading}
            actions={[
              {
                confirmDescription:
                  "These changes will atomically update the public profile. If the member saved again, the backend will refuse this stale decision.",
                confirmLabel: "Approve changes",
                confirmTitle: "Approve the latest profile?",
                disabled: Boolean(blockingIssue) || selfReview,
                label: selfReview ? selfReviewReason : "Approve changes",
                status: "APPROVED",
                tone: "primary",
              },
              {
                confirmDescription:
                  "These changes will be rejected with the reviewer note shown to the member.",
                confirmLabel: "Reject changes",
                confirmTitle: "Reject these profile changes?",
                disabled: selfReview,
                label: selfReview ? selfReviewReason : "Reject",
                notePlaceholder: "Explain what the member needs to fix.",
                requiresNote: true,
                status: "REJECTED",
                tone: "danger",
              },
            ]}
            onError={captureReviewError}
            onSubmit={request ? decide : () => Promise.resolve()}
            onSuccess={() => setActionIssues([])}
            successBody={(status) =>
              `The profile changes were ${status.toLowerCase()}.`
            }
            successTitle="Profile review saved"
          />
        </section>
      ) : null}
      {message ? (
        <p className="m-0 flex items-center gap-[.45rem] text-[.82rem] leading-[1.5] text-ink-muted">
          {message}
        </p>
      ) : null}
    </div>
  );
}

function ReviewPortrait({
  label,
  assetId,
}: {
  label: string;
  assetId?: string | null;
}) {
  return (
    <figure className="grid gap-2">
      {assetId ? (
        <Image
          alt={label}
          className="aspect-square w-full max-w-[220px] rounded-[3px] object-cover"
          height={220}
          src={`${API_URL}/assets/${assetId}`}
          width={220}
        />
      ) : (
        <span className="grid aspect-square w-full max-w-[220px] place-items-center rounded-[3px] border border-dashed border-line bg-surface-subtle text-[.75rem] text-ink-muted">
          No image
        </span>
      )}
      <figcaption className="font-mono text-[.62rem] uppercase tracking-[.06em] text-ink-muted">
        {label}
      </figcaption>
    </figure>
  );
}

function ProfileDiff({
  current,
  currentAvatar,
  proposed,
  proposedAvatar,
  loading = false,
}: {
  current: ProfileEditPayload;
  loading?: boolean;
  currentAvatar?: string | null;
  proposed: ProfileEditPayload;
  proposedAvatar?: string | null;
}) {
  const fields: Array<{
    key: keyof Omit<ProfileEditPayload, "removeAvatar">;
    label: string;
  }> = [
    { key: "fullName", label: "Full name" },
    { key: "headline", label: "Headline" },
    { key: "phone", label: "Phone" },
    { key: "expertise", label: "Expertise" },
    { key: "biography", label: "Biography" },
    { key: "contactAddress", label: "Address" },
    { key: "links", label: "Links" },
    { key: "sections", label: "Profile sections" },
  ];
  const changes = loading
    ? fields.slice(0, 4)
    : fields.filter(
        ({ key }) => !profileValuesEqual(current[key], proposed[key]),
      );
  const imageChanged = !loading && currentAvatar !== proposedAvatar;

  return (
    <section className="grid gap-4" data-loading={loading || undefined}>
      <div className="flex items-end justify-between gap-4 border-b border-line pb-4 @max-[520px]:flex-col @max-[520px]:items-start">
        <div>
          <p className="m-0 mb-4 font-[var(--font-sans)] text-[.75rem] font-extrabold uppercase tracking-[.12em] text-brand">
            Requested changes
          </p>
          <h2
            className={cn(
              "m-0 font-sans text-[clamp(1.4rem,2.4vw,2rem)] font-normal leading-[1.1]",
              loadingPlaceholder(loading, "text", "medium"),
            )}
            data-placeholder={loading ? "text" : undefined}
            data-placeholder-width="medium"
          >
            {changes.length + Number(imageChanged)} changed field
            {changes.length + Number(imageChanged) === 1 ? "" : "s"}
          </h2>
        </div>
        <span className="font-mono text-[.68rem] uppercase tracking-[.05em] text-ink-muted">
          − current&nbsp;&nbsp;+ proposed
        </span>
      </div>
      {imageChanged ? (
        <article className="grid grid-cols-[140px_minmax(0,1fr)] gap-4 border-b border-line py-4 @max-[520px]:grid-cols-1">
          <h3 className="m-0 font-mono text-[.7rem] font-semibold uppercase tracking-[.06em] text-ink-muted">
            Profile image
          </h3>
          <div className="grid grid-cols-2 gap-4 @max-[420px]:grid-cols-1">
            <div className="grid grid-cols-[20px_minmax(0,1fr)] gap-2 rounded-small bg-danger-soft p-3 text-danger">
              <ReviewPortrait label="Current" assetId={currentAvatar} />
            </div>
            <div className="grid grid-cols-[20px_minmax(0,1fr)] gap-2 rounded-small bg-success-soft p-3 text-success">
              <ReviewPortrait label="Proposed" assetId={proposedAvatar} />
            </div>
          </div>
        </article>
      ) : null}
      {changes.map(({ key, label }) => (
        <article
          className="grid grid-cols-[140px_minmax(0,1fr)_minmax(0,1fr)] gap-4 border-b border-line py-4 last:border-b-0 @max-[620px]:grid-cols-1"
          key={key}
        >
          <h3 className="m-0 font-mono text-[.7rem] font-semibold uppercase tracking-[.06em] text-ink-muted">
            {label}
          </h3>
          <DiffValue
            after={formatProfileValue(key, proposed[key])}
            before={formatProfileValue(key, current[key])}
            className="grid grid-cols-[20px_minmax(0,1fr)] gap-2 rounded-small bg-danger-soft p-3 text-danger"
            loading={loading}
            marker="−"
            side="before"
          />
          <DiffValue
            after={formatProfileValue(key, proposed[key])}
            before={formatProfileValue(key, current[key])}
            className="grid grid-cols-[20px_minmax(0,1fr)] gap-2 rounded-small bg-success-soft p-3 text-success"
            loading={loading}
            marker="+"
            side="after"
          />
        </article>
      ))}
      {!changes.length && !imageChanged ? (
        <p className="m-0 text-[.82rem] leading-[1.5] text-ink-muted">
          No public profile fields changed.
        </p>
      ) : null}
    </section>
  );
}

function DiffValue({
  after,
  before,
  className,
  marker,
  side,
  loading = false,
}: {
  after: string;
  before: string;
  className: string;
  loading?: boolean;
  marker: string;
  side: "after" | "before";
}) {
  const chunks = compactDiff(diffText(before || "Empty", after || "Empty"));
  return (
    <div className={className}>
      <span aria-hidden="true" className="font-mono font-bold">
        {marker}
      </span>
      <p
        className={cn(
          "m-0 min-w-0 whitespace-pre-wrap text-[.78rem] leading-[1.55] [overflow-wrap:anywhere]",
          loadingPlaceholder(loading, "text", "full"),
        )}
        data-placeholder={loading ? "text" : undefined}
        data-placeholder-width="full"
      >
        {loading
          ? "Loading profile value"
          : chunks.flatMap((chunk, index) => {
              if (chunk.kind === "added" && side === "before") return [];
              if (chunk.kind === "removed" && side === "after") return [];
              const changed = chunk.kind !== "equal";
              return changed ? (
                <mark
                  className="rounded-[2px] bg-[color-mix(in_srgb,currentColor_12%,transparent)] px-[2px] text-inherit"
                  key={index}
                >
                  {chunk.value}
                </mark>
              ) : (
                <span key={index}>{chunk.value}</span>
              );
            })}
      </p>
    </div>
  );
}

function compactDiff(chunks: DiffChunk[]): DiffChunk[] {
  const firstChange = chunks.findIndex(({ kind }) => kind !== "equal");
  const lastChange = chunks.findLastIndex(({ kind }) => kind !== "equal");
  if (firstChange < 0) return chunks;

  const visible = chunks.slice(firstChange, lastChange + 1);
  const prefix = chunks
    .slice(0, firstChange)
    .map(({ value }) => value)
    .join("");
  const suffix = chunks
    .slice(lastChange + 1)
    .map(({ value }) => value)
    .join("");
  if (prefix) {
    visible.unshift({
      kind: "equal",
      value: `${prefix.length > 64 ? "…" : ""}${prefix.slice(-64)}`,
    });
  }
  if (suffix) {
    visible.push({
      kind: "equal",
      value: `${suffix.slice(0, 64)}${suffix.length > 64 ? "…" : ""}`,
    });
  }
  return visible;
}

interface DiffChunk {
  kind: "added" | "equal" | "removed";
  value: string;
}

function diffText(before: string, after: string): DiffChunk[] {
  const left = tokenize(before);
  const right = tokenize(after);
  if (left.length * right.length > 1_000_000) {
    return boundedDiff(left, right);
  }

  const lengths = Array.from(
    { length: left.length + 1 },
    () => new Uint16Array(right.length + 1),
  );
  for (let leftIndex = left.length - 1; leftIndex >= 0; leftIndex -= 1) {
    for (let rightIndex = right.length - 1; rightIndex >= 0; rightIndex -= 1) {
      lengths[leftIndex][rightIndex] =
        left[leftIndex] === right[rightIndex]
          ? lengths[leftIndex + 1][rightIndex + 1] + 1
          : Math.max(
              lengths[leftIndex + 1][rightIndex],
              lengths[leftIndex][rightIndex + 1],
            );
    }
  }

  const chunks: DiffChunk[] = [];
  let leftIndex = 0;
  let rightIndex = 0;
  while (leftIndex < left.length && rightIndex < right.length) {
    if (left[leftIndex] === right[rightIndex]) {
      appendChunk(chunks, "equal", left[leftIndex]);
      leftIndex += 1;
      rightIndex += 1;
    } else if (
      lengths[leftIndex + 1][rightIndex] >= lengths[leftIndex][rightIndex + 1]
    ) {
      appendChunk(chunks, "removed", left[leftIndex]);
      leftIndex += 1;
    } else {
      appendChunk(chunks, "added", right[rightIndex]);
      rightIndex += 1;
    }
  }
  while (leftIndex < left.length) {
    appendChunk(chunks, "removed", left[leftIndex]);
    leftIndex += 1;
  }
  while (rightIndex < right.length) {
    appendChunk(chunks, "added", right[rightIndex]);
    rightIndex += 1;
  }
  return chunks;
}

function boundedDiff(left: string[], right: string[]): DiffChunk[] {
  let start = 0;
  while (start < left.length && left[start] === right[start]) start += 1;
  let leftEnd = left.length;
  let rightEnd = right.length;
  while (
    leftEnd > start &&
    rightEnd > start &&
    left[leftEnd - 1] === right[rightEnd - 1]
  ) {
    leftEnd -= 1;
    rightEnd -= 1;
  }
  const chunks: DiffChunk[] = [
    { kind: "equal", value: left.slice(0, start).join("") },
    { kind: "removed", value: left.slice(start, leftEnd).join("") },
    { kind: "added", value: right.slice(start, rightEnd).join("") },
    { kind: "equal", value: left.slice(leftEnd).join("") },
  ];
  return chunks.filter(({ value }) => value);
}

function tokenize(value: string): string[] {
  return value.match(/\s+|[\p{L}\p{N}_]+|[^\s\p{L}\p{N}_]+/gu) ?? [];
}

function appendChunk(
  chunks: DiffChunk[],
  kind: DiffChunk["kind"],
  value: string,
): void {
  const previous = chunks.at(-1);
  if (previous?.kind === kind) previous.value += value;
  else chunks.push({ kind, value });
}

function formatProfileValue(
  key: keyof Omit<ProfileEditPayload, "removeAvatar">,
  value: ProfileEditPayload[typeof key],
): string {
  if (key === "expertise" && Array.isArray(value)) return value.join(", ");
  if (key === "links" && Array.isArray(value)) {
    return (value as ProfileEditPayload["links"])
      .map(
        ({ label, type, url }) =>
          `${label} [${type.replaceAll("_", " ").toLowerCase()}]\n${url}`,
      )
      .join("\n\n");
  }
  if (key === "sections" && Array.isArray(value)) {
    return (value as ProfileEditPayload["sections"])
      .map(
        ({ subsections, title, type }) =>
          `${title} [${type.replaceAll("_", " ").toLowerCase()}]\n${(
            subsections ?? []
          )
            .map(
              ({ entries, heading }) =>
                `${heading ?? "Details"}\n${entries
                  .map((entry) => {
                    if (typeof entry === "string") return entry;
                    return entry.label
                      ? `${entry.label}\n${entry.content}`
                      : entry.content;
                  })
                  .join("\n\n")}`,
            )
            .join("\n\n")}`,
      )
      .join("\n\n");
  }
  return typeof value === "string" ? value : "";
}
