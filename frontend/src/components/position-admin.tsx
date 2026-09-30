"use client";

import { cn } from "@/lib/cn";
import { loadingPlaceholder } from "@/lib/loading-style";
import { useRouter } from "next/navigation";
import { SyntheticEvent, useEffect, useState, type ReactNode } from "react";
import { CircleOff, CirclePlay, Plus, Save, Trash2 } from "lucide-react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { SelectControl } from "@/components/ui/select-control";
import { DateField, DateTimeField } from "@/components/ui/date-time-field";
import {
  formControlClass,
  InputControl,
  TextareaControl,
} from "@/components/ui/form-controls";
import { StatePanel } from "@/components/state-panel";
import { useNotifications } from "@/components/notification-provider";
import { ApiRequestError, apiRequest } from "@/lib/client-api";
import type { Department, Position } from "@/lib/types";
import { ButtonControl, ButtonLink } from "@/components/ui/button-control";
import { SegmentedControl } from "@/components/ui/segmented-control";
import {
  ReviewIssueStamp,
  SemanticStatus,
} from "@/components/ui/semantic-status";
import { useReviewIssues } from "@/lib/use-review-issues";
import {
  WorkspaceCollection,
  WorkspaceRow,
} from "@/components/ui/workspace-surface";

const POSITION_TYPES = [
  "INTERNSHIP",
  "RESEARCH_ASSISTANT",
  "PROJECT_ASSISTANT",
  "FELLOW",
  "STAFF",
  "VOLUNTEER",
  "OTHER",
];
const ENGAGEMENT_TYPES = ["FIXED_TERM", "OPEN_ENDED", "FLEXIBLE"];
const RANKS = [
  "RESEARCH_INTERN",
  "RESEARCH_ASSISTANT",
  "RESEARCHER",
  "SENIOR_RESEARCHER",
  "LEAD_RESEARCHER",
  "DEPARTMENT_HEAD",
  "ADVISOR",
];

const EMPTY_POSITION = {
  closesAt: "",
  departmentId: "",
  description: "",
  engagementDurationLabel: "",
  engagementEndsAt: "",
  engagementStartsAt: "",
  engagementType: "FIXED_TERM",
  weeklyCommitmentHours: "",
  opensAt: "",
  positionType: "INTERNSHIP",
  requirements: [""],
  responsibilities: [""],
  summary: "",
  targetRank: "",
  title: "",
};

type PositionFormState = typeof EMPTY_POSITION;

export function PositionAdminList() {
  const { showToast } = useNotifications();
  const [positions, setPositions] = useState<Position[]>([]);
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [reload, setReload] = useState(0);
  const [updatingIds, setUpdatingIds] = useState<Set<string>>(() => new Set());
  const actionIssues = useReviewIssues();

  useEffect(() => {
    void apiRequest<Position[]>("/positions/admin", { method: "GET" })
      .then((nextPositions) => {
        setError(undefined);
        setPositions(nextPositions);
      })
      .catch((caught: unknown) => {
        const message =
          caught instanceof Error
            ? caught.message
            : "Could not load positions.";
        setError(message);
        showToast({
          body: message,
          title: "Positions unavailable",
          tone: "error",
        });
      })
      .finally(() => setLoading(false));
  }, [reload, showToast]);

  async function setEnabled(position: Position, enabled: boolean) {
    setUpdatingIds((current) => new Set(current).add(position.id));
    try {
      const updated = await apiRequest<Position>(
        `/positions/${position.id}/${enabled ? "enable" : "disable"}`,
        { method: "POST" },
      );
      setPositions((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
      actionIssues.clearOne(position.id);
      showToast({
        body: enabled
          ? `${updated.title} is enabled for the public site.`
          : `${updated.title} is disabled and no longer accepts applications.`,
        title: enabled ? "Job post enabled" : "Job post disabled",
      });
    } catch (error) {
      const requestError = error instanceof ApiRequestError ? error : undefined;
      if (requestError?.issues.length) actionIssues.capture(requestError);
      else
        actionIssues.setOne(position.id, {
          code: "POSITION_STATE_UPDATE_FAILED",
          message: "This job post publication state could not be updated.",
          tone: "error",
        });
      showToast({
        body: requestError?.message ?? "Could not update job post.",
        title: "Update failed",
        tone: "error",
      });
    } finally {
      setUpdatingIds((current) => {
        const next = new Set(current);
        next.delete(position.id);
        return next;
      });
    }
  }

  return (
    <div className="mx-auto grid w-full min-w-0">
      {error && !positions.length && !loading ? (
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
          title="Could not load positions"
          variant="error"
        />
      ) : loading || positions.length ? (
        <WorkspaceCollection data-loading={loading || undefined}>
          {(loading && !positions.length
            ? Array.from({ length: 5 }, () => undefined)
            : positions
          ).map((position, index) => {
            const issue = position
              ? actionIssues.forItem(position.id)[0]
              : undefined;
            return (
              <WorkspaceRow
                className="relative grid grid-cols-[minmax(0,1fr)_130px_auto] items-center gap-4 bg-transparent py-[.75rem] max-[760px]:grid-cols-1 max-[760px]:gap-2.5"
                key={position?.id ?? `position-loading-${index}`}
              >
                {position ? <ReviewIssueStamp issue={issue} /> : null}
                <div>
                  <strong
                    className={cn(
                      "block text-[.84rem] font-medium leading-[1.35]",
                      loadingPlaceholder(loading, "text", "long"),
                    )}
                    data-placeholder="text"
                    data-placeholder-width="long"
                  >
                    {position?.title ?? "Loading position"}
                  </strong>
                  <div className="mt-[.25rem] flex flex-wrap items-center gap-2">
                    <span
                      className={cn(
                        "text-[.72rem] capitalize text-ink-muted",
                        loadingPlaceholder(loading, "label", "medium"),
                      )}
                      data-placeholder="label"
                      data-placeholder-width="medium"
                    >
                      {position
                        ? positionTypeLabel(position.positionType)
                        : "Loading type"}
                    </span>
                    {issue ? (
                      <SemanticStatus
                        loading={loading || updatingIds.has(position?.id ?? "")}
                        tone={issue.tone ?? "error"}
                      >
                        {issue.message}
                      </SemanticStatus>
                    ) : null}
                  </div>
                </div>
                <span
                  className={cn(
                    "text-[.72rem] capitalize text-ink-muted",
                    loadingPlaceholder(loading, "label", "medium"),
                  )}
                  data-placeholder="label"
                  data-placeholder-width="medium"
                >
                  {position ? (position._count?.applications ?? 0) : 0}{" "}
                  {(position?._count?.applications ?? 0) === 1
                    ? "application"
                    : "applications"}
                </span>
                <div className="flex items-center justify-end gap-[.85rem] max-[760px]:justify-start">
                  <SegmentedControl
                    ariaLabel={
                      position
                        ? `${position.title} publication state`
                        : "Job post publication state"
                    }
                    disabled={
                      loading ||
                      !position ||
                      updatingIds.has(position?.id ?? "")
                    }
                    loading={loading || updatingIds.has(position?.id ?? "")}
                    onValueChange={(value) => {
                      if (!position) return;
                      const nextEnabled = value === "OPEN";
                      if ((position.status === "OPEN") === nextEnabled) return;
                      void setEnabled(position, nextEnabled);
                    }}
                    options={[
                      { label: "Disabled", tone: "neutral", value: "DISABLED" },
                      { label: "Enabled", tone: "success", value: "OPEN" },
                    ]}
                    value={position?.status === "OPEN" ? "OPEN" : "DISABLED"}
                  />
                  {position && updatingIds.has(position.id) ? (
                    <span className="text-[.72rem] text-ink-muted">
                      Updating…
                    </span>
                  ) : null}
                  <ButtonLink
                    compact
                    href={
                      position ? `/workspace/positions/${position.id}` : "#"
                    }
                    loading={loading || !position}
                  >
                    Edit
                  </ButtonLink>
                </div>
              </WorkspaceRow>
            );
          })}
        </WorkspaceCollection>
      ) : (
        <StatePanel
          frame="workspace"
          body="Create the first job post, then enable it when it is ready to accept applications."
          title="No job posts yet"
        />
      )}
    </div>
  );
}

export function PositionAdminEditor({ id }: { id?: string }) {
  const router = useRouter();
  const { showToast } = useNotifications();
  const [departments, setDepartments] = useState<Department[]>([]);
  const [form, setForm] = useState<PositionFormState>(EMPTY_POSITION);
  const [loadError, setLoadError] = useState<string>();
  const [loading, setLoading] = useState(Boolean(id));
  const [loadingDepartments, setLoadingDepartments] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletePending, setDeletePending] = useState(false);
  const [descriptionOpen, setDescriptionOpen] = useState(false);
  const [submitError, setSubmitError] = useState<string>();
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    void apiRequest<Department[]>("/departments", { method: "GET" })
      .then(setDepartments)
      .catch(() => setDepartments([]))
      .finally(() => setLoadingDepartments(false));
  }, []);

  useEffect(() => {
    if (!id) return;
    void apiRequest<Position>(`/positions/admin/${id}`, { method: "GET" })
      .then((position) => {
        setLoadError(undefined);
        setForm(positionToForm(position));
        setEnabled(position.status === "OPEN");
        setDescriptionOpen(Boolean(position.description?.trim()));
      })
      .catch((error: unknown) => {
        const message =
          error instanceof Error ? error.message : "Could not load position.";
        setLoadError(message);
        showToast({
          body: message,
          title: "Position unavailable",
          tone: "error",
        });
      })
      .finally(() => setLoading(false));
  }, [id, showToast]);

  async function submit(event: SyntheticEvent<HTMLFormElement, SubmitEvent>) {
    event.preventDefault();
    setSubmitError(undefined);
    const validationError = validatePositionForm(form);
    if (validationError) {
      setSubmitError(validationError);
      showToast({
        body: validationError,
        title: "Check position timing",
        tone: "error",
      });
      return;
    }
    setSaving(true);
    try {
      const saved = await apiRequest<Position>(
        id ? `/positions/${id}` : "/positions",
        {
          body: JSON.stringify(formToPayload(form)),
          headers: { "content-type": "application/json" },
          method: id ? "PATCH" : "POST",
        },
      );
      showToast({
        body: `${saved.title} was ${id ? "updated" : "created"}.`,
        title: "Position saved",
      });
      router.push(`/workspace/positions/${saved.id}`);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Could not save position.";
      setSubmitError(message);
      showToast({
        body: message,
        title: "Save failed",
        tone: "error",
      });
    } finally {
      setSaving(false);
    }
  }

  async function deletePost() {
    if (!id) return;
    setSaving(true);
    try {
      await apiRequest(`/positions/${id}`, { method: "DELETE" });
      showToast({
        body: "The job post was deleted.",
        title: "Job post deleted",
      });
      router.push("/workspace/positions");
    } catch (error) {
      showToast({
        body:
          error instanceof Error ? error.message : "Could not delete job post.",
        title: "Delete failed",
        tone: "error",
      });
    } finally {
      setSaving(false);
    }
  }

  async function toggleEnabled() {
    if (!id) return;
    setSaving(true);
    try {
      const nextEnabled = !enabled;
      const updated = await apiRequest<Position>(
        `/positions/${id}/${nextEnabled ? "enable" : "disable"}`,
        { method: "POST" },
      );
      setEnabled(updated.status === "OPEN");
      showToast({
        body: nextEnabled
          ? "The job post is enabled for the public site."
          : "The job post is disabled and no longer accepts applications.",
        title: nextEnabled ? "Job post enabled" : "Job post disabled",
      });
    } catch (error) {
      showToast({
        body:
          error instanceof Error ? error.message : "Could not update job post.",
        title: "Update failed",
        tone: "error",
      });
    } finally {
      setSaving(false);
    }
  }

  const editorLoading = loading || loadingDepartments;
  if (!editorLoading && loadError) {
    return (
      <StatePanel
        body="The position record could not be retrieved."
        title={loadError}
        variant="error"
      />
    );
  }

  const timingError = validatePositionForm(form, false);
  const showDescription = descriptionOpen || Boolean(form.description.trim());

  return (
    <>
      <form
        className="grid w-full gap-6 pb-20"
        data-loading={editorLoading || undefined}
        onSubmit={submit}
      >
        <header className="frame-rail-section flex items-end justify-between gap-4 py-[1.1rem] max-[760px]:flex-col max-[760px]:items-stretch">
          <div>
            <p className="m-0 mb-4 font-[var(--font-sans)] text-[.75rem] font-extrabold uppercase tracking-[.12em] text-brand">
              Job posts
            </p>
            <h2
              className={cn(
                "mt-[.35rem] font-sans text-[clamp(1.8rem,3vw,2.4rem)] font-normal leading-none",
                loadingPlaceholder(editorLoading, "text", "medium"),
              )}
              data-placeholder={editorLoading ? "text" : undefined}
              data-placeholder-width="medium"
            >
              {id ? "Edit job post" : "Create job post"}
            </h2>
            <p className="mt-[.55rem] max-w-[680px] text-[.82rem] leading-[1.55] text-ink-muted">
              New posts stay disabled until you enable them. Application timing
              remains separate from the engagement period.
            </p>
          </div>
          <div className="flex flex-wrap justify-end gap-[.6rem] max-[760px]:justify-stretch">
            {id ? (
              <>
                <ButtonControl
                  compact
                  className={loadingPlaceholder(editorLoading, "control")}
                  data-placeholder={editorLoading ? "control" : undefined}
                  disabled={editorLoading || saving}
                  onClick={() => void toggleEnabled()}
                  type="button"
                  variant="secondary"
                >
                  {enabled ? (
                    <CircleOff aria-hidden="true" size={16} />
                  ) : (
                    <CirclePlay aria-hidden="true" size={16} />
                  )}
                  {enabled ? "Disable" : "Enable"}
                </ButtonControl>
                <ButtonControl
                  compact
                  className={loadingPlaceholder(editorLoading, "control")}
                  data-placeholder={editorLoading ? "control" : undefined}
                  disabled={editorLoading || saving}
                  onClick={() => setDeletePending(true)}
                  type="button"
                  variant="danger"
                >
                  <Trash2 aria-hidden="true" size={16} /> Delete
                </ButtonControl>
              </>
            ) : null}
            <ButtonControl
              compact
              className={loadingPlaceholder(editorLoading, "control")}
              data-placeholder={editorLoading ? "control" : undefined}
              disabled={editorLoading || saving}
              type="submit"
            >
              <Save aria-hidden="true" size={16} />{" "}
              {id ? "Save changes" : "Create job post"}
            </ButtonControl>
          </div>
        </header>
        {submitError ? (
          <p
            className="m-0 border-l-[3px] border-danger bg-danger-soft px-4 py-3 text-[.78rem] text-danger"
            role="alert"
          >
            {submitError}
          </p>
        ) : null}
        <section className="frame-rail-section grid gap-6 py-[clamp(1.25rem,3vw,2rem)]">
          <div className="grid gap-1 border-b border-line pb-[1.15rem]">
            <h3 className="m-0 text-[clamp(1.35rem,2.5vw,1.8rem)]">
              Role basics
            </h3>
            <p className="m-0 text-[.78rem] leading-[1.5] text-ink-muted">
              Public-facing role information and internal categorization.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-4 max-[760px]:grid-cols-1">
            <Field label="Title">
              <InputControl
                loading={editorLoading}
                required
                maxLength={200}
                value={form.title}
                onChange={(event) =>
                  setForm({ ...form, title: event.target.value })
                }
              />
            </Field>
            <Field label="Position type">
              <SelectControl
                loading={editorLoading}
                options={POSITION_TYPES.map(option)}
                value={form.positionType}
                onValueChange={(positionType) =>
                  setForm({ ...form, positionType })
                }
              />
            </Field>
            <Field label="Target rank">
              <SelectControl
                loading={editorLoading}
                options={[
                  { label: "None", value: "NONE" },
                  ...RANKS.map(option),
                ]}
                value={form.targetRank || "NONE"}
                onValueChange={(targetRank) =>
                  setForm({
                    ...form,
                    targetRank: targetRank === "NONE" ? "" : targetRank,
                  })
                }
              />
            </Field>
            <Field label="Department">
              <SelectControl
                loading={editorLoading}
                options={[
                  { label: "None", value: "NONE" },
                  ...departments.map((department) => ({
                    label: department.name,
                    value: department.id,
                  })),
                ]}
                value={form.departmentId || "NONE"}
                onValueChange={(departmentId) =>
                  setForm({
                    ...form,
                    departmentId: departmentId === "NONE" ? "" : departmentId,
                  })
                }
              />
            </Field>
            <Field label="Engagement type">
              <SelectControl
                loading={editorLoading}
                options={ENGAGEMENT_TYPES.map(option)}
                value={form.engagementType}
                onValueChange={(engagementType) =>
                  setForm({
                    ...form,
                    engagementType,
                    engagementEndsAt:
                      engagementType === "OPEN_ENDED"
                        ? ""
                        : form.engagementEndsAt,
                  })
                }
              />
            </Field>
          </div>
        </section>
        <section className="frame-rail-section grid gap-6 py-[clamp(1.25rem,3vw,2rem)]">
          <div className="grid gap-1 border-b border-line pb-[1.15rem]">
            <h3 className="m-0 text-[clamp(1.35rem,2.5vw,1.8rem)]">Timing</h3>
            <p className="m-0 text-[.78rem] leading-[1.5] text-ink-muted">
              Use local time for application windows. Leave close date empty for
              rolling applications.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-4 max-[760px]:grid-cols-1">
            <Field label="Applications open">
              <DateTimeField
                disabled={editorLoading}
                label="Applications open"
                loading={editorLoading}
                maxValue={form.closesAt}
                showInlineLabel={false}
                value={form.opensAt}
                onChange={(opensAt) => setForm({ ...form, opensAt })}
              />
            </Field>
            <Field label="Applications close">
              <DateTimeField
                disabled={editorLoading}
                label="Applications close"
                loading={editorLoading}
                minValue={form.opensAt}
                showInlineLabel={false}
                value={form.closesAt}
                onChange={(closesAt) => setForm({ ...form, closesAt })}
              />
            </Field>
            <Field label="Engagement starts">
              <DateField
                disabled={editorLoading}
                label="Engagement starts"
                loading={editorLoading}
                maxValue={form.engagementEndsAt}
                showInlineLabel={false}
                value={form.engagementStartsAt}
                onChange={(engagementStartsAt) =>
                  setForm({ ...form, engagementStartsAt })
                }
              />
            </Field>
            <Field label="Engagement ends">
              {form.engagementType === "OPEN_ENDED" ? (
                <div
                  aria-disabled="true"
                  className={cn(
                    formControlClass,
                    "flex items-center bg-surface-subtle text-ink-muted",
                  )}
                >
                  No end date for open-ended roles
                </div>
              ) : (
                <DateField
                  disabled={editorLoading}
                  label="Engagement ends"
                  loading={editorLoading}
                  minValue={form.engagementStartsAt}
                  showInlineLabel={false}
                  value={form.engagementEndsAt}
                  onChange={(engagementEndsAt) =>
                    setForm({ ...form, engagementEndsAt })
                  }
                />
              )}
            </Field>
            <Field label="Duration label">
              <InputControl
                loading={editorLoading}
                maxLength={200}
                placeholder="6 months, summer term, rolling"
                value={form.engagementDurationLabel}
                onChange={(event) =>
                  setForm({
                    ...form,
                    engagementDurationLabel: event.target.value,
                  })
                }
              />
            </Field>
            <Field label="Weekly commitment">
              <InputControl
                loading={editorLoading}
                max="168"
                min="1"
                placeholder="Hours per week"
                type="number"
                value={form.weeklyCommitmentHours}
                onChange={(event) =>
                  setForm({
                    ...form,
                    weeklyCommitmentHours: event.target.value,
                  })
                }
              />
            </Field>
            {timingError ? (
              <p
                className="col-span-full m-0 border border-danger/30 border-l-[3px] border-l-danger bg-danger-soft px-[.9rem] py-3 text-[.78rem] leading-[1.45] text-danger"
                role="alert"
              >
                {timingError}
              </p>
            ) : null}
          </div>
        </section>
        <section className="frame-rail-section grid gap-6 py-[clamp(1.25rem,3vw,2rem)]">
          <div className="grid gap-1 border-b border-line pb-[1.15rem]">
            <h3 className="m-0 text-[clamp(1.35rem,2.5vw,1.8rem)]">
              Public content
            </h3>
            <p className="m-0 text-[.78rem] leading-[1.5] text-ink-muted">
              Keep the public posting scannable with one summary and focused
              lists.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-4 max-[760px]:grid-cols-1">
            <Field full label="Overview">
              <TextareaControl
                loading={editorLoading}
                required
                maxLength={8000}
                rows={3}
                value={form.summary}
                onChange={(event) =>
                  setForm({ ...form, summary: event.target.value })
                }
              />
            </Field>
            {showDescription ? (
              <Field full label="Additional context">
                <TextareaControl
                  loading={editorLoading}
                  maxLength={20000}
                  rows={4}
                  value={form.description}
                  onChange={(event) =>
                    setForm({ ...form, description: event.target.value })
                  }
                />
              </Field>
            ) : (
              <div className="col-span-full">
                <ButtonControl
                  compact
                  disabled={editorLoading}
                  loading={editorLoading}
                  onClick={() => setDescriptionOpen(true)}
                  variant="dashed"
                >
                  <Plus aria-hidden="true" size={16} /> Add context
                </ButtonControl>
              </div>
            )}
            <ListEditor
              loading={editorLoading}
              label="Responsibilities"
              onChange={(responsibilities) =>
                setForm({ ...form, responsibilities })
              }
              placeholder="Review papers, reproduce experiments, prepare weekly notes"
              values={form.responsibilities}
            />
            <ListEditor
              loading={editorLoading}
              label="Requirements"
              minimumItems={1}
              onChange={(requirements) => setForm({ ...form, requirements })}
              placeholder="Strong Python skills, prior ML coursework, weekly availability"
              required
              values={form.requirements}
            />
          </div>
        </section>
      </form>
      <ConfirmDialog
        busy={saving}
        confirmLabel="Delete job post"
        description="This permanently removes the job post. Posts with applications must be disabled instead so those records remain available."
        onCancel={() => setDeletePending(false)}
        onConfirm={() => void deletePost()}
        open={deletePending}
        title="Delete this job post?"
        tone="danger"
      />
    </>
  );
}

function Field({
  children,
  full,
  label,
}: {
  children: ReactNode;
  full?: boolean;
  label: string;
}) {
  return (
    <label
      className={`grid min-w-0 content-start gap-[.4rem] ${full ? "col-span-full max-[760px]:col-span-1" : ""}`}
    >
      <span className="text-[.78rem] font-semibold leading-[1.35] text-ink">
        {label}
      </span>
      {children}
    </label>
  );
}

function ListEditor({
  label,
  loading = false,
  minimumItems = 0,
  onChange,
  placeholder,
  required,
  values,
}: {
  label: string;
  loading?: boolean;
  minimumItems?: number;
  onChange: (values: string[]) => void;
  placeholder: string;
  required?: boolean;
  values: string[];
}) {
  const rows = values.length ? values : [""];

  function update(index: number, value: string) {
    onChange(
      rows.map((item, itemIndex) => (itemIndex === index ? value : item)),
    );
  }

  function remove(index: number) {
    const nextRows = rows.filter((_, itemIndex) => itemIndex !== index);
    onChange(nextRows.length ? nextRows : [""]);
  }

  return (
    <div className="col-span-full grid min-w-0 content-start gap-[.4rem] max-[760px]:col-span-1">
      <span className="text-[.78rem] font-semibold leading-[1.35] text-ink">
        {label}
      </span>
      <div className="grid gap-[.55rem]">
        {rows.map((item, index) => (
          <div
            className="grid grid-cols-[34px_minmax(0,1fr)_40px] items-center gap-[.65rem]"
            key={index}
          >
            <span className="font-mono text-[.65rem] text-ink-faint">
              {String(index + 1).padStart(2, "0")}
            </span>
            <InputControl
              loading={loading}
              aria-label={`${label} ${index + 1}`}
              disabled={loading}
              onChange={(event) => update(index, event.target.value)}
              placeholder={placeholder}
              required={required && index < minimumItems}
              value={item}
            />
            <button
              aria-label={`Remove ${label.toLowerCase()} ${index + 1}`}
              className={cn(
                "flex h-10 w-10 cursor-pointer items-center justify-center rounded-control border border-line bg-transparent text-ink-muted hover:border-danger hover:bg-danger-soft hover:text-danger disabled:cursor-not-allowed disabled:opacity-35",
                loadingPlaceholder(loading, "control"),
              )}
              data-placeholder={loading ? "control" : undefined}
              disabled={loading || rows.length <= Math.max(1, minimumItems)}
              onClick={() => remove(index)}
              type="button"
            >
              <Trash2 aria-hidden="true" size={16} />
            </button>
          </div>
        ))}
      </div>
      <ButtonControl
        className="justify-self-start"
        compact
        disabled={loading}
        loading={loading}
        onClick={() => onChange([...rows, ""])}
        variant="add-another"
      >
        <Plus aria-hidden="true" size={16} /> Add another{" "}
        {label === "Responsibilities" ? "responsibility" : "requirement"}
      </ButtonControl>
    </div>
  );
}

function option(value: string) {
  return { label: positionTypeLabel(value), value };
}

function positionToForm(position: Position): PositionFormState {
  return {
    closesAt: toDateTimeLocal(position.closesAt),
    departmentId: position.departmentId ?? position.department?.id ?? "",
    description: position.description ?? "",
    engagementDurationLabel: position.engagementDurationLabel ?? "",
    engagementEndsAt: toDateInput(position.engagementEndsAt),
    engagementStartsAt: toDateInput(position.engagementStartsAt),
    engagementType: position.engagementType,
    weeklyCommitmentHours: position.weeklyCommitmentHours
      ? String(position.weeklyCommitmentHours)
      : "",
    opensAt: toDateTimeLocal(position.opensAt),
    positionType: position.positionType,
    requirements: position.requirements.length ? position.requirements : [""],
    responsibilities: position.responsibilities.length
      ? position.responsibilities
      : [""],
    summary: position.summary,
    targetRank: position.targetRank ?? "",
    title: position.title,
  };
}

function formToPayload(form: PositionFormState) {
  return {
    closesAt: dateTimeOrNull(form.closesAt),
    departmentId: form.departmentId || null,
    description: form.description || null,
    engagementDurationLabel: form.engagementDurationLabel || null,
    engagementEndsAt: dateOrNull(form.engagementEndsAt),
    engagementStartsAt: dateOrNull(form.engagementStartsAt),
    engagementType: form.engagementType,
    ...(form.weeklyCommitmentHours
      ? { weeklyCommitmentHours: Number(form.weeklyCommitmentHours) }
      : {}),
    opensAt: dateTimeOrNull(form.opensAt),
    positionType: form.positionType,
    requirements: cleanRows(form.requirements),
    responsibilities: cleanRows(form.responsibilities),
    summary: form.summary,
    targetRank: form.targetRank || null,
    title: form.title,
  };
}

function cleanRows(value: string[]): string[] {
  return value.map((item) => item.trim()).filter(Boolean);
}

function toDateInput(value: string | null): string {
  return value ? value.slice(0, 10) : "";
}

function toDateTimeLocal(value: string | null): string {
  return value ? value.slice(0, 16).replace("T", " ") : "";
}

function dateOrNull(value: string): string | null {
  if (!value) return null;
  const date = parseDateInput(value);
  if (!date) throw new Error("Invalid date");
  return date.toISOString();
}

function dateTimeOrNull(value: string): string | null {
  if (!value) return null;
  const date = parseDateTimeInput(value);
  if (!date) throw new Error("Invalid date and time");
  return date.toISOString();
}

function validatePositionForm(
  form: PositionFormState,
  requireCompleteness = true,
): string | undefined {
  const opensAt = form.opensAt ? parseDateTimeInput(form.opensAt) : undefined;
  const closesAt = form.closesAt
    ? parseDateTimeInput(form.closesAt)
    : undefined;
  const engagementStartsAt = form.engagementStartsAt
    ? parseDateInput(form.engagementStartsAt)
    : undefined;
  const engagementEndsAt = form.engagementEndsAt
    ? parseDateInput(form.engagementEndsAt)
    : undefined;

  if (form.opensAt && !opensAt)
    return "Applications open must be a valid date and time.";
  if (form.closesAt && !closesAt)
    return "Applications close must be a valid date and time.";
  if (opensAt && closesAt && closesAt <= opensAt) {
    return "Applications close must be after applications open.";
  }
  if (form.engagementStartsAt && !engagementStartsAt) {
    return "Engagement starts must be a valid date.";
  }
  if (form.engagementEndsAt && !engagementEndsAt) {
    return "Engagement ends must be a valid date.";
  }
  if (
    engagementStartsAt &&
    engagementEndsAt &&
    engagementEndsAt <= engagementStartsAt
  ) {
    return "Engagement ends must be after engagement starts.";
  }
  if (
    requireCompleteness &&
    form.engagementType === "FIXED_TERM" &&
    !engagementEndsAt &&
    !form.engagementDurationLabel.trim()
  ) {
    return "Fixed-term positions need an engagement end date or a duration label.";
  }
  if (form.engagementType === "OPEN_ENDED" && engagementEndsAt) {
    return "Open-ended positions cannot have an engagement end date.";
  }
  if (
    requireCompleteness &&
    form.engagementType === "FLEXIBLE" &&
    !form.engagementDurationLabel.trim()
  ) {
    return "Flexible positions need a duration label.";
  }
  if (requireCompleteness && !form.title.trim()) return "Title is required.";
  if (requireCompleteness && !form.summary.trim())
    return "Overview is required.";
  if (requireCompleteness && !cleanRows(form.requirements).length) {
    return "Add at least one requirement.";
  }
  return undefined;
}

function parseDateInput(value: string): Date | undefined {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return undefined;
  const [, year, month, day] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  return localDateValue(date) === value ? date : undefined;
}

function parseDateTimeInput(value: string): Date | undefined {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})$/);
  if (!match) return undefined;
  const [, year, month, day, hour, minute] = match;
  const date = new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
  );
  const dateMatches = localDateValue(date) === `${year}-${month}-${day}`;
  const timeMatches =
    String(date.getHours()).padStart(2, "0") === hour &&
    String(date.getMinutes()).padStart(2, "0") === minute;
  return dateMatches && timeMatches ? date : undefined;
}

function localDateValue(value: Date): string {
  return [
    value.getFullYear(),
    String(value.getMonth() + 1).padStart(2, "0"),
    String(value.getDate()).padStart(2, "0"),
  ].join("-");
}

function positionTypeLabel(value: string): string {
  return value
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/^./, (letter) => letter.toUpperCase());
}
