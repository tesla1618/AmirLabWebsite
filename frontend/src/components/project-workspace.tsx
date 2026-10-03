"use client";

import { loadingPlaceholder } from "@/lib/loading-style";
import Link from "next/link";
import { WorkspaceRowLink } from "@/components/ui/workspace-row-link";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type SyntheticEvent,
} from "react";
import {
  ArrowLeft,
  ArrowUpRight,
  Archive,
  Plus,
  Save,
  Send,
  Trash2,
} from "lucide-react";
import { useNotifications } from "@/components/notification-provider";
import { ButtonControl } from "@/components/ui/button-control";
import { CheckboxControl } from "@/components/ui/checkbox-control";
import { DateField } from "@/components/ui/date-time-field";
import { InputControl, TextareaControl } from "@/components/ui/form-controls";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { SelectControl } from "@/components/ui/select-control";
import { apiRequest } from "@/lib/client-api";
import { StatePanel } from "@/components/state-panel";
import { cn } from "@/lib/cn";
import { WorkspaceCollection } from "@/components/ui/workspace-surface";

interface WorkspaceProject {
  researchItemId: string;
  status: string | null;
  objective: string | null;
  startsAt: string | null;
  endsAt: string | null;
  publicPageEnabled: boolean;
  progress: number;
  researchItem: {
    id: string;
    slug: string;
    title: string | null;
    summary: string | null;
    reviewStatus: string;
    projectOutputs: Array<{
      output: { id: string; title: string | null; type: string };
    }>;
  };
  objectives: Array<{ id: string; title: string; description: string | null }>;
  milestones: Array<{
    id: string;
    title: string;
    description: string | null;
    weight: number;
    progress: number;
    status: string;
    dueAt: string | null;
    ownerId: string | null;
  }>;
  tasks: Array<{
    id: string;
    title: string;
    description: string | null;
    status: string;
    priority: string;
    dueAt: string | null;
    ownerId: string | null;
    owner: { id: string; fullName: string } | null;
  }>;
  updates: Array<{
    id: string;
    title: string;
    body: string;
    status: string;
    createdAt: string;
    publishedAt: string | null;
  }>;
  memberships: Array<{
    id: string;
    role: string;
    access: string;
    status: string;
    person: { id: string; fullName: string; slug: string };
  }>;
  invitations: Array<{
    id: string;
    email: string;
    status: string;
    access: string;
  }>;
  resources: Array<{ id: string; label: string; kind: string; url: string }>;
  changeRequests: Array<{
    id: string;
    kind: string;
    status: string;
    submittedAt: string;
  }>;
}

interface LinkablePerson {
  id: string;
  fullName: string;
  slug: string;
}

interface OutputSearchResult {
  id: string;
  title: string | null;
  type: string;
  canonicalUrl: string | null;
}

export function ProjectIndex() {
  const [projects, setProjects] = useState<WorkspaceProject[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    apiRequest<WorkspaceProject[]>("/projects/mine", { method: "GET" })
      .then((nextProjects) => {
        setProjects(nextProjects);
        setError("");
      })
      .catch((value: Error) => setError(value.message))
      .finally(() => setLoading(false));
  }, [reload]);
  return (
    <div className="grid min-w-0">
      <WorkspaceCollection>
        {error && !projects.length && !loading ? (
          <StatePanel
            action={{
              label: "Retry",
              onClick: () => {
                setLoading(true);
                setReload((value) => value + 1);
              },
            }}
            body="The connection dropped. Nothing was lost; reconnect to continue."
            title="Could not load projects"
            variant="error"
          />
        ) : null}
        {error && projects.length ? (
          <p className="mt-4 border-l-[3px] border-danger bg-danger-soft px-4 py-[.8rem] text-[.75rem]">
            {error}
          </p>
        ) : null}
        {loading || !error
          ? (loading && !projects.length
              ? Array.from({ length: 4 }, (_, index) =>
                  emptyProject(`loading-${index}`),
                )
              : projects
            ).map((project, index) => (
              <WorkspaceRowLink
                key={project.researchItemId || `project-loading-${index}`}
                loading={loading}
                className="grid grid-cols-[minmax(0,1fr)_190px_auto] items-center gap-6 py-[.95rem] max-[700px]:grid-cols-1 max-[700px]:gap-3"
                href={
                  loading
                    ? "#"
                    : `/workspace/projects/${project.researchItemId}`
                }
              >
                <div>
                  <span
                    className={cn(
                      "font-mono text-[.61rem] text-ink-muted uppercase",
                      loadingPlaceholder(loading, "label", "medium"),
                    )}
                    data-placeholder={loading ? "label" : undefined}
                    data-placeholder-width="medium"
                  >
                    {project.researchItem.reviewStatus === "ARCHIVED"
                      ? "ARCHIVED"
                      : (project.status?.replaceAll("_", " ") ?? "Project")}
                  </span>
                  <h2
                    className={cn(
                      "my-[.22rem] font-sans text-[1.03rem] font-medium leading-[1.3]",
                      loadingPlaceholder(loading, "text", "long"),
                    )}
                    data-placeholder={loading ? "text" : undefined}
                    data-placeholder-width="long"
                  >
                    {project.researchItem.title ?? "Loading project"}
                  </h2>
                  <p
                    className={cn(
                      "m-0 max-w-[680px] text-[.72rem] leading-[1.45] text-ink-muted",
                      loadingPlaceholder(loading, "text", "full"),
                    )}
                    data-placeholder={loading ? "text" : undefined}
                    data-placeholder-width="full"
                  >
                    {project.researchItem.summary ??
                      project.objective ??
                      "Loading project summary"}
                  </p>
                </div>
                <div className="grid gap-[.45rem]">
                  <strong
                    className={cn(
                      "font-mono text-[1.18rem] font-medium",
                      loadingPlaceholder(loading, "value"),
                    )}
                    data-placeholder={loading ? "value" : undefined}
                  >
                    {project.progress}%
                  </strong>
                  <svg
                    aria-hidden="true"
                    className="h-[3px] w-full"
                    preserveAspectRatio="none"
                    viewBox="0 0 100 3"
                  >
                    <rect className="fill-line" height="3" width="100" />
                    <rect
                      className="fill-brand"
                      height="3"
                      width={loading ? 40 : project.progress}
                    />
                  </svg>
                  <small
                    className={cn(
                      "font-mono text-[.61rem] text-ink-muted uppercase",
                      loadingPlaceholder(loading, "label", "long"),
                    )}
                    data-placeholder={loading ? "label" : undefined}
                    data-placeholder-width="long"
                  >
                    {project.milestones.length} milestones ·{" "}
                    {project.memberships.length} members
                  </small>
                </div>
                <ArrowUpRight
                  className={loading ? "opacity-[.12]" : undefined}
                  data-loading-icon={loading ? "true" : undefined}
                  size={19}
                />
              </WorkspaceRowLink>
            ))
          : null}
        {!loading && !projects.length && !error ? (
          <StatePanel
            body="Create a project or assign this account to an existing workspace."
            title="No project workspaces are assigned to this account yet"
            variant="empty"
          />
        ) : null}
      </WorkspaceCollection>
    </div>
  );
}

type Tab =
  | "overview"
  | "tasks"
  | "timeline"
  | "updates"
  | "people"
  | "outputs"
  | "settings";

const milestoneStatusOptions = [
  { label: "Planned", value: "PLANNED" },
  { label: "In progress", value: "IN_PROGRESS" },
  { label: "Blocked", value: "BLOCKED" },
  { label: "Complete", value: "COMPLETE" },
];

const accessOptions = [
  { label: "View", value: "VIEW" },
  { label: "Post updates", value: "POST_UPDATES" },
  { label: "Manage", value: "MANAGE" },
];

const projectStatusOptions = [
  { label: "Planned", value: "PLANNED" },
  { label: "Active", value: "ACTIVE" },
  { label: "Paused", value: "PAUSED" },
  { label: "Completed", value: "COMPLETED" },
];

const taskStatusOptions = [
  { label: "To do", value: "TODO" },
  { label: "In progress", value: "IN_PROGRESS" },
  { label: "Blocked", value: "BLOCKED" },
  { label: "Done", value: "DONE" },
];

const taskPriorityOptions = [
  { label: "Low", value: "LOW" },
  { label: "Normal", value: "NORMAL" },
  { label: "High", value: "HIGH" },
  { label: "Urgent", value: "URGENT" },
];

export function ProjectManager({ id }: { id: string }) {
  const { showToast } = useNotifications();
  const [project, setProject] = useState<WorkspaceProject | null>(null);
  const [tab, setTab] = useState<Tab>("overview");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busyAction, setBusyAction] = useState<string>();
  const load = useCallback(
    () =>
      apiRequest<WorkspaceProject>(`/projects/${id}/workspace`, {
        method: "GET",
      })
        .then((nextProject) => {
          setProject(nextProject);
          setError("");
          return true;
        })
        .catch((value: Error) => {
          setError(value.message);
          return false;
        }),
    [id],
  );
  useEffect(() => {
    void load();
  }, [load]);
  const weight = useMemo(
    () => project?.milestones.reduce((sum, item) => sum + item.weight, 0) ?? 0,
    [project],
  );
  async function submit(
    action: string,
    path: string,
    method: string,
    body: unknown,
  ) {
    setBusyAction(action);
    setError("");
    setMessage("");
    let mutationApplied = false;
    try {
      const result = await apiRequest<{
        outcome?: "APPLIED" | "QUEUED_FOR_REVIEW";
        direct?: boolean;
        status?: string;
      }>(path, {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      mutationApplied = true;
      const nextMessage =
        result?.outcome === "QUEUED_FOR_REVIEW" ||
        (result?.outcome === undefined &&
          (result?.direct === false || result?.status === "NEEDS_REVIEW"))
          ? "Saved as a review request."
          : "Changes saved.";
      const refreshed = await load();
      if (!refreshed) {
        const refreshMessage =
          "Changes were saved, but the project could not be refreshed.";
        setMessage(refreshMessage);
        showToast({
          body: refreshMessage,
          title: "Project saved, refresh failed",
          tone: "error",
        });
        return;
      }
      setMessage(nextMessage);
      showToast({ body: nextMessage, title: "Project updated" });
    } catch (value) {
      const message = mutationApplied
        ? "Changes were saved, but the project could not be refreshed."
        : value instanceof Error
          ? value.message
          : "Unable to save";
      setError(message);
      showToast({
        body: message,
        title: mutationApplied
          ? "Project saved, refresh failed"
          : "Project was not saved",
        tone: "error",
      });
    } finally {
      setBusyAction(undefined);
    }
  }
  const loadingProject = !project;
  const currentProject = project ?? emptyProject(id);
  const archived = currentProject.researchItem.reviewStatus === "ARCHIVED";
  const deadlines = projectDeadlineSummary(currentProject);

  return (
    <div className="grid min-w-0" data-loading={loadingProject || undefined}>
      {archived ? (
        <section
          aria-label="Archived project notice"
          className="mb-4 flex min-h-20 items-center justify-between gap-5 border border-warning border-l-4 bg-warning-soft px-5 py-4 text-warning max-[640px]:items-start max-[640px]:flex-col"
          role="status"
        >
          <div className="flex items-start gap-3">
            <Archive aria-hidden="true" className="mt-0.5 shrink-0" size={19} />
            <div>
              <strong className="block text-[.91rem] font-bold tracking-[.01em]">
                This project is archived
              </strong>
              <span className="text-[.78rem]">
                This project is locked. Unarchive it to make changes.
              </span>
            </div>
          </div>
          <ButtonControl
            disabled={busyAction === "unarchive"}
            onClick={() =>
              submit("unarchive", `/projects/${id}/unarchive`, "POST", {})
            }
            variant="primary"
          >
            Unarchive project
          </ButtonControl>
        </section>
      ) : null}
      <div className="flex items-center justify-between gap-4 border-b border-line pb-6 max-[640px]:items-start max-[640px]:flex-col">
        <Link
          className="inline-flex items-center gap-[.4rem] justify-self-start text-[.78rem] font-bold text-ink-muted hover:text-brand"
          href="/workspace/projects"
        >
          <ArrowLeft aria-hidden="true" size={15} /> Projects
        </Link>
        {currentProject.publicPageEnabled ? (
          <Link
            className="inline-flex min-h-[var(--control-height)] items-center justify-center gap-[.55rem] rounded-control border border-line-strong bg-transparent px-[.9rem] py-[.62rem] text-[.78rem] font-semibold hover:bg-surface-subtle"
            href={`/projects/${currentProject.researchItem.slug}`}
          >
            Preview public page <ArrowUpRight size={15} />
          </Link>
        ) : null}
      </div>
      <header className="flex items-end justify-between gap-8 border-b border-line py-4 pb-[1.15rem] max-[640px]:items-start max-[640px]:flex-col max-[640px]:gap-4">
        <div className="min-w-0">
          <p className="mb-[.42rem] font-mono text-[.61rem] font-semibold tracking-[.11em] text-brand uppercase">
            {currentProject.researchItem.reviewStatus === "ARCHIVED"
              ? "ARCHIVED"
              : (currentProject.status?.replaceAll("_", " ") ??
                "Project workspace")}
          </p>
          <h1
            className={cn(
              "my-[.25rem] mb-[.55rem] break-words font-sans text-[clamp(2.1rem,4vw,3.5rem)] leading-none font-medium tracking-[-.04em]",
              loadingPlaceholder(loadingProject, "text", "long"),
            )}
            data-placeholder={loadingProject ? "text" : undefined}
            data-placeholder-width="long"
          >
            {currentProject.researchItem.title ??
              (loadingProject ? "Loading project" : "Untitled project")}
          </h1>
          <p
            className={cn(
              "m-0 max-w-[720px] text-[.84rem] leading-[1.55] text-ink-muted",
              loadingPlaceholder(loadingProject, "text", "full"),
            )}
            data-placeholder={loadingProject ? "text" : undefined}
            data-placeholder-width="full"
          >
            {currentProject.researchItem.summary ??
              currentProject.objective ??
              (loadingProject
                ? "Loading project summary"
                : "No project summary yet.")}
          </p>
        </div>
        <span
          className={cn(
            "shrink-0 rounded-[2px] border border-line px-2 py-[.35rem] font-mono text-[.53rem] text-ink-muted uppercase",
            loadingPlaceholder(loadingProject, "label", "medium"),
          )}
          data-placeholder={loadingProject ? "label" : undefined}
          data-placeholder-width="medium"
        >
          {currentProject.publicPageEnabled
            ? "Public profile enabled"
            : "Internal workspace"}
        </span>
      </header>
      <div className="grid grid-cols-[repeat(3,minmax(0,1fr))_auto] border-b border-line-strong max-[900px]:grid-cols-3 max-[640px]:grid-cols-1">
        <div className="grid grid-cols-[1fr_auto] gap-x-2 gap-y-[.1rem] border-r border-line px-[.8rem] py-[.65rem] max-[640px]:border-r-0 max-[640px]:border-b">
          <span className="font-mono text-[.52rem] tracking-[.06em] text-ink-muted uppercase">
            Delivery watch
          </span>
          <strong
            className={cn(
              "row-span-2 font-mono text-base font-medium",
              loadingPlaceholder(loadingProject, "value"),
            )}
            data-placeholder={loadingProject ? "value" : undefined}
          >
            {deadlines.overdueTasks + deadlines.overdueMilestones}
          </strong>
          <small className="text-[.6rem] text-ink-muted">overdue items</small>
        </div>
        <div className="grid grid-cols-[1fr_auto] gap-x-2 gap-y-[.1rem] border-r border-line px-[.8rem] py-[.65rem] max-[640px]:border-r-0 max-[640px]:border-b">
          <span className="font-mono text-[.52rem] tracking-[.06em] text-ink-muted uppercase">
            Next 7 days
          </span>
          <strong
            className={cn(
              "row-span-2 font-mono text-base font-medium",
              loadingPlaceholder(loadingProject, "value"),
            )}
            data-placeholder={loadingProject ? "value" : undefined}
          >
            {deadlines.dueSoonTasks + deadlines.dueSoonMilestones}
          </strong>
          <small className="text-[.6rem] text-ink-muted">
            tasks + milestones due
          </small>
        </div>
        <div className="grid grid-cols-[1fr_auto] gap-x-2 gap-y-[.1rem] border-r border-line px-[.8rem] py-[.65rem] max-[640px]:border-r-0 max-[640px]:border-b">
          <span className="font-mono text-[.52rem] tracking-[.06em] text-ink-muted uppercase">
            Blocked
          </span>
          <strong
            className={cn(
              "row-span-2 font-mono text-base font-medium",
              loadingPlaceholder(loadingProject, "value"),
            )}
            data-placeholder={loadingProject ? "value" : undefined}
          >
            {deadlines.blockedTasks + deadlines.blockedMilestones}
          </strong>
          <small className="text-[.6rem] text-ink-muted">
            items need intervention
          </small>
        </div>
        <button
          className={cn(
            "flex cursor-pointer items-center gap-[.35rem] border-0 bg-transparent px-[.8rem] py-[.65rem] text-[.67rem] font-semibold whitespace-nowrap text-brand hover:bg-surface-subtle max-[900px]:col-span-full max-[900px]:border-t max-[900px]:border-line max-[640px]:col-auto",
            loadingPlaceholder(loadingProject, "control"),
          )}
          data-placeholder={loadingProject ? "control" : undefined}
          disabled={loadingProject}
          onClick={() => setTab("timeline")}
          type="button"
        >
          Open timeline <ArrowUpRight size={14} />
        </button>
      </div>

      <nav className="flex gap-6 overflow-x-auto border-b border-line">
        {(
          [
            "overview",
            "tasks",
            "timeline",
            "updates",
            "people",
            "outputs",
            "settings",
          ] as Tab[]
        ).map((value) => (
          <button
            className={cn(
              "relative cursor-pointer border-0 bg-transparent py-4 text-[.75rem] font-semibold text-ink-muted capitalize",
              tab === value &&
                "text-brand after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:bg-brand after:content-['']",
            )}
            disabled={loadingProject}
            key={value}
            onClick={() => setTab(value)}
            type="button"
          >
            {value}
          </button>
        ))}
      </nav>
      {message ? (
        <p className="mt-4 border-l-[3px] border-success bg-success-soft px-4 py-[.8rem] text-[.75rem]">
          {message}
        </p>
      ) : null}
      {error ? (
        <p className="mt-4 border-l-[3px] border-danger bg-danger-soft px-4 py-[.8rem] text-[.75rem]">
          {error}
        </p>
      ) : null}
      <div className="grid grid-cols-[minmax(180px,220px)_minmax(0,1fr)] items-start gap-[clamp(1.5rem,3vw,3rem)] pt-[1.4rem] max-[900px]:grid-cols-1">
        <aside className="sticky top-4 grid gap-4 border-t border-line max-[900px]:static">
          <p className="mb-[.42rem] font-mono text-[.61rem] font-semibold tracking-[.11em] text-brand uppercase">
            Project state
          </p>
          <h2
            className={cn(
              "my-[.2rem] font-sans text-[1.6rem] font-normal",
              loadingPlaceholder(loadingProject, "text", "medium"),
            )}
            data-placeholder={loadingProject ? "text" : undefined}
            data-placeholder-width="medium"
          >
            {currentProject.progress}% complete
          </h2>
          <svg
            aria-label={`${currentProject.progress}% complete`}
            className="h-[3px] w-full"
            preserveAspectRatio="none"
            role="img"
            viewBox="0 0 100 3"
          >
            <rect className="fill-line" height="3" width="100" />
            <rect
              className="fill-brand"
              height="3"
              width={currentProject.progress}
            />
          </svg>
          <dl className="grid gap-3">
            <div className="flex justify-between border-t border-line pt-3">
              <dt className="text-[.68rem] text-ink-muted">Tasks</dt>
              <dd
                className={cn(
                  "m-0 font-mono text-[.62rem] uppercase",
                  loadingPlaceholder(loadingProject, "value"),
                )}
                data-placeholder={loadingProject ? "value" : undefined}
              >
                {
                  currentProject.tasks.filter((item) => item.status === "DONE")
                    .length
                }{" "}
                / {currentProject.tasks.length}
              </dd>
            </div>
            <div className="flex justify-between border-t border-line pt-3">
              <dt className="text-[.68rem] text-ink-muted">Milestones</dt>
              <dd
                className={cn(
                  "m-0 font-mono text-[.62rem] uppercase",
                  loadingPlaceholder(loadingProject, "value"),
                )}
                data-placeholder={loadingProject ? "value" : undefined}
              >
                {
                  currentProject.milestones.filter(
                    (item) => item.status === "COMPLETE",
                  ).length
                }{" "}
                / {currentProject.milestones.length}
              </dd>
            </div>
            <div className="flex justify-between border-t border-line pt-3">
              <dt className="text-[.68rem] text-ink-muted">Contributors</dt>
              <dd
                className={cn(
                  "m-0 font-mono text-[.62rem] uppercase",
                  loadingPlaceholder(loadingProject, "value"),
                )}
                data-placeholder={loadingProject ? "value" : undefined}
              >
                {
                  currentProject.memberships.filter(
                    (item) => item.status === "ACTIVE",
                  ).length
                }
              </dd>
            </div>
            <div className="flex justify-between border-t border-line pt-3">
              <dt className="text-[.68rem] text-ink-muted">Visibility</dt>
              <dd
                className={cn(
                  "m-0 font-mono text-[.62rem] uppercase",
                  loadingPlaceholder(loadingProject, "label"),
                )}
                data-placeholder={loadingProject ? "label" : undefined}
              >
                {currentProject.publicPageEnabled ? "Public" : "Private"}
              </dd>
            </div>
          </dl>
        </aside>
        <main>
          <fieldset className="contents border-0 p-0" disabled={archived}>
            <legend className="sr-only">
              {archived ? "Archived project, read only" : "Project workspace"}
            </legend>
            {tab === "overview" ? (
              <Overview loading={loadingProject} project={currentProject} />
            ) : null}
            {!loadingProject && tab === "tasks" ? (
              <Tasks
                project={currentProject}
                busy={busyAction === "tasks"}
                create={(body) =>
                  submit("tasks", `/projects/${id}/tasks`, "POST", body)
                }
                update={(taskId, body) =>
                  submit(
                    "tasks",
                    `/projects/${id}/tasks/${taskId}`,
                    "PATCH",
                    body,
                  )
                }
                remove={(taskId) =>
                  submit(
                    "tasks",
                    `/projects/${id}/tasks/${taskId}`,
                    "DELETE",
                    undefined,
                  )
                }
              />
            ) : null}
            {!loadingProject && tab === "timeline" ? (
              <Timeline
                project={currentProject}
                weight={weight}
                busy={busyAction === "timeline"}
                save={(milestones) =>
                  submit("timeline", `/projects/${id}/milestones`, "PUT", {
                    milestones,
                  })
                }
              />
            ) : null}
            {!loadingProject && tab === "updates" ? (
              <Updates
                project={currentProject}
                busy={busyAction === "updates"}
                save={(body) =>
                  submit("updates", `/projects/${id}/updates`, "POST", {
                    ...body,
                  })
                }
              />
            ) : null}
            {!loadingProject && tab === "people" ? (
              <People
                project={currentProject}
                busy={busyAction === "people"}
                save={(body) =>
                  submit("people", `/projects/${id}/invitations`, "POST", {
                    ...body,
                  })
                }
              />
            ) : null}
            {!loadingProject && tab === "outputs" ? (
              <Outputs
                project={currentProject}
                busy={busyAction === "output"}
                output={(body) =>
                  submit("output", `/projects/${id}/outputs`, "POST", {
                    ...body,
                  })
                }
                resource={(body) =>
                  submit("resource", `/projects/${id}/resources`, "POST", {
                    ...body,
                  })
                }
              />
            ) : null}
            {!loadingProject && tab === "settings" ? (
              <Settings
                project={currentProject}
                busy={busyAction === "settings" || busyAction === "archive"}
                save={(body) =>
                  submit("settings", `/projects/${id}`, "PATCH", {
                    ...body,
                  })
                }
                archive={() =>
                  submit("archive", `/projects/${id}/archive`, "POST", {})
                }
              />
            ) : null}
          </fieldset>
        </main>
      </div>
    </div>
  );
}

function Overview({
  project,
  loading = false,
}: {
  project: WorkspaceProject;
  loading?: boolean;
}) {
  return (
    <div className="grid min-w-0 gap-5" data-loading={loading || undefined}>
      <header className="flex items-end justify-between gap-4">
        <p className="mb-[.42rem] font-mono text-[.61rem] font-semibold tracking-[.11em] text-brand uppercase">
          Project record
        </p>
        <h2 className="mt-[.4rem] mb-0 font-sans text-[clamp(1.6rem,3vw,2.3rem)] font-normal">
          Overview
        </h2>
      </header>
      <div className="border-t border-line">
        <div className="grid grid-cols-[120px_1fr] gap-4 border-b border-line py-4">
          <span className="font-mono text-[.58rem] text-ink-faint uppercase">
            Summary
          </span>
          <p
            className={cn(
              "m-0 text-[.75rem] leading-[1.55] text-ink-muted",
              loadingPlaceholder(loading, "text", "full"),
            )}
            data-placeholder={loading ? "text" : undefined}
            data-placeholder-width="full"
          >
            {project.researchItem.summary ||
              (loading ? "Loading summary" : "No summary yet.")}
          </p>
        </div>
        <div className="grid grid-cols-[120px_1fr] gap-4 border-b border-line py-4">
          <span className="font-mono text-[.58rem] text-ink-faint uppercase">
            Main objective
          </span>
          <p
            className={cn(
              "m-0 text-[.75rem] leading-[1.55] text-ink-muted",
              loadingPlaceholder(loading, "text", "full"),
            )}
            data-placeholder={loading ? "text" : undefined}
            data-placeholder-width="full"
          >
            {project.objective ||
              (loading ? "Loading objective" : "No objective yet.")}
          </p>
        </div>
      </div>
      {project.changeRequests.length > 0 ? (
        <section aria-label="Pending project changes" className="grid gap-3">
          <header className="flex items-end justify-between gap-4">
            <p className="mb-[.42rem] font-mono text-[.61rem] font-semibold tracking-[.11em] text-brand uppercase">
              Review queue
            </p>
            <h2 className="mt-[.4rem] mb-0 font-sans text-[clamp(1.3rem,2.5vw,1.8rem)] font-normal">
              Pending review
            </h2>
          </header>
          <ul className="m-0 grid list-none border-t border-line p-0">
            {project.changeRequests.map((request) => (
              <li
                className="flex items-center justify-between gap-4 border-b border-line py-3"
                key={request.id}
              >
                <span className="text-[.75rem] font-medium">
                  {request.kind.replaceAll("_", " ").toLowerCase()}
                </span>
                <span className="font-mono text-[.58rem] text-ink-muted">
                  Submitted {new Date(request.submittedAt).toLocaleDateString()}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <header className="flex items-end justify-between gap-4">
        <p className="mb-[.42rem] font-mono text-[.61rem] font-semibold tracking-[.11em] text-brand uppercase">
          Scope
        </p>
        <h2 className="mt-[.4rem] mb-0 font-sans text-[clamp(1.6rem,3vw,2.3rem)] font-normal">
          Research objectives
        </h2>
      </header>
      <ol className="m-0 list-none p-0">
        {(loading && !project.objectives.length
          ? Array.from({ length: 3 }, (_, index) => ({
              id: `objective-loading-${index}`,
              title: "Loading objective",
              description: "Loading objective details",
            }))
          : project.objectives
        ).map((item) => (
          <li className="border-t border-line p-4" key={item.id}>
            <strong
              className={cn(
                "mt-[.3rem] block font-sans text-[1.1rem]",
                loadingPlaceholder(loading, "text", "long"),
              )}
              data-placeholder={loading ? "text" : undefined}
              data-placeholder-width="long"
            >
              {item.title}
            </strong>
            <p
              className={cn(
                "text-[.75rem] leading-[1.55] text-ink-muted",
                loadingPlaceholder(loading, "text", "full"),
              )}
              data-placeholder={loading ? "text" : undefined}
              data-placeholder-width="full"
            >
              {item.description}
            </p>
          </li>
        ))}
      </ol>
    </div>
  );
}

function Tasks({
  project,
  busy,
  create,
  update,
  remove,
}: {
  project: WorkspaceProject;
  busy: boolean;
  create: (body: object) => void;
  update: (taskId: string, body: object) => void;
  remove: (taskId: string) => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [ownerId, setOwnerId] = useState("");
  const [priority, setPriority] = useState("NORMAL");
  const [dueAt, setDueAt] = useState("");
  const members = project.memberships.filter(
    (membership) => membership.status === "ACTIVE",
  );
  const ownerOptions = members.map(({ person }) => ({
    label: person.fullName,
    value: person.id,
  }));
  function createTask(event: SyntheticEvent<HTMLFormElement, SubmitEvent>) {
    event.preventDefault();
    create({
      title,
      description: description || undefined,
      ownerId: ownerId || undefined,
      priority,
      dueAt: dueAt || undefined,
    });
    setTitle("");
    setDescription("");
    setDueAt("");
  }
  return (
    <div className="grid min-w-0 gap-5">
      <header className="flex items-end justify-between gap-4">
        <div>
          <p className="mb-[.42rem] font-mono text-[.61rem] font-semibold tracking-[.11em] text-brand uppercase">
            Operational work
          </p>
          <h2 className="mt-[.4rem] mb-0 font-sans text-[clamp(1.6rem,3vw,2.3rem)] font-normal">
            Tasks
          </h2>
        </div>
        <span className="font-mono text-[.65rem] text-ink-muted uppercase">
          {project.tasks.filter((task) => task.status !== "DONE").length} open
        </span>
      </header>
      <form
        className="grid grid-cols-[minmax(180px,1fr)_minmax(150px,.65fr)_minmax(130px,.45fr)_auto] items-end gap-4 border-y border-line-strong bg-transparent p-[1.2rem] max-[900px]:grid-cols-1"
        onSubmit={createTask}
      >
        <div className="grid gap-[.35rem] text-[.64rem] font-semibold">
          <label htmlFor="task-title">Task</label>
          <InputControl
            id="task-title"
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Define the next concrete action"
            required
            value={title}
          />
        </div>
        <div className="grid col-span-full gap-[.35rem] text-[.64rem] font-semibold max-[900px]:col-auto">
          <label htmlFor="task-description">Details</label>
          <TextareaControl
            id="task-description"
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Expected result, evidence, or handoff notes"
            value={description}
          />
        </div>
        <label className="grid gap-[.35rem] text-[.64rem] font-semibold">
          Assignee
          <SearchableSelect
            ariaLabel="Task assignee"
            emptyMessage="No active project members."
            onValueChange={setOwnerId}
            options={ownerOptions}
            placeholder="Unassigned"
            searchPlaceholder="Search project members…"
            value={ownerId}
          />
        </label>
        <label className="grid gap-[.35rem] text-[.64rem] font-semibold">
          Priority
          <SelectControl
            ariaLabel="Task priority"
            onValueChange={setPriority}
            options={taskPriorityOptions}
            value={priority}
          />
        </label>
        <label className="grid gap-[.35rem] text-[.64rem] font-semibold">
          Due date
          <DateField
            label="Task due date"
            onChange={setDueAt}
            showInlineLabel={false}
            value={dueAt}
          />
        </label>
        <ButtonControl
          disabled={busy || !title.trim()}
          loading={busy}
          type="submit"
          variant="primary"
        >
          <Plus size={15} /> Add task
        </ButtonControl>
      </form>
      <div className="grid border-t border-line">
        {project.tasks.length ? (
          project.tasks.map((task) => (
            <article
              className="grid grid-cols-[minmax(0,1fr)_180px_36px] items-center gap-4 border-b border-line px-[.25rem] py-4 max-[640px]:grid-cols-[1fr_36px]"
              key={task.id}
            >
              <div className="grid min-w-0 gap-[.3rem]">
                <span
                  className={cn(
                    "font-mono text-[.58rem] text-ink-muted uppercase",
                    (task.priority === "HIGH" || task.priority === "URGENT") &&
                      "text-danger",
                  )}
                >
                  {task.priority}
                </span>
                <strong
                  className={cn(
                    "text-[.92rem]",
                    task.status === "DONE" && "text-ink-muted line-through",
                  )}
                >
                  {task.title}
                </strong>
                {task.description ? (
                  <p className="m-0 text-[.75rem] leading-[1.55] text-ink-muted">
                    {task.description}
                  </p>
                ) : null}
                <small className="text-[.68rem] text-ink-faint">
                  {task.owner?.fullName ?? "Unassigned"}
                  {task.dueAt
                    ? ` · due ${new Date(task.dueAt).toLocaleDateString()}`
                    : ""}
                </small>
              </div>
              <SelectControl
                ariaLabel={`Status for ${task.title}`}
                onValueChange={(status) =>
                  update(task.id, {
                    title: task.title,
                    description: task.description ?? undefined,
                    ownerId: task.ownerId ?? undefined,
                    priority: task.priority,
                    dueAt: task.dueAt ?? undefined,
                    status,
                  })
                }
                options={taskStatusOptions}
                size="compact"
                value={task.status}
              />
              <button
                aria-label={`Delete ${task.title}`}
                className="flex h-[34px] w-[34px] cursor-pointer items-center justify-center rounded-control border-0 bg-transparent text-ink-muted hover:bg-danger-soft hover:text-danger"
                disabled={busy}
                onClick={() => remove(task.id)}
                type="button"
              >
                <Trash2 size={15} />
              </button>
            </article>
          ))
        ) : (
          <div className="px-[.25rem] py-10 text-ink-muted">
            <strong>No tasks yet</strong>
            <p className="mt-[.35rem] mb-0">
              Turn the project objective into assigned, trackable work.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function Timeline({
  project,
  weight,
  busy,
  save,
}: {
  project: WorkspaceProject;
  weight: number;
  busy: boolean;
  save: (items: WorkspaceProject["milestones"]) => void;
}) {
  const [items, setItems] = useState(project.milestones);
  useEffect(() => {
    queueMicrotask(() => setItems(project.milestones));
  }, [project]);
  const edit = (index: number, key: string, value: string | number) =>
    setItems((current) =>
      current.map((item, itemIndex) =>
        itemIndex === index ? { ...item, [key]: value } : item,
      ),
    );
  const addMilestone = () =>
    setItems((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        title: "New milestone",
        description: null,
        weight: 1,
        progress: 0,
        status: "PLANNED",
        dueAt: null,
        ownerId: null,
      },
    ]);
  return (
    <div className="grid min-w-0 gap-5">
      <header className="flex items-end justify-between gap-4">
        <div>
          <p className="mb-[.42rem] font-mono text-[.61rem] font-semibold tracking-[.11em] text-brand uppercase">
            Weighted milestones
          </p>
          <h2 className="mt-[.4rem] mb-0 font-sans text-[clamp(1.6rem,3vw,2.3rem)] font-normal">
            Progress model
          </h2>
        </div>
      </header>
      {!items.length ? (
        <ButtonControl compact onClick={addMilestone} variant="add-empty">
          <Plus size={15} /> Add milestone
        </ButtonControl>
      ) : null}
      <div className="grid border-t border-line">
        {items.map((item, index) => (
          <article
            className="grid grid-cols-[minmax(150px,1fr)_72px_76px_minmax(130px,160px)_minmax(130px,160px)_38px] items-end gap-[.8rem] border-b border-line py-[.9rem] max-[900px]:grid-cols-1"
            key={item.id}
          >
            <label className="grid min-w-0 gap-[.35rem] text-[.64rem] font-semibold">
              Milestone
              <InputControl
                value={item.title}
                onChange={(event) => edit(index, "title", event.target.value)}
              />
            </label>
            <label className="grid min-w-0 gap-[.35rem] text-[.64rem] font-semibold">
              Weight
              <InputControl
                min="1"
                max="100"
                type="number"
                value={item.weight}
                onChange={(event) =>
                  edit(index, "weight", Number(event.target.value))
                }
              />
            </label>
            <label className="grid min-w-0 gap-[.35rem] text-[.64rem] font-semibold">
              Progress
              <InputControl
                min="0"
                max="100"
                type="number"
                value={item.progress}
                onChange={(event) =>
                  edit(index, "progress", Number(event.target.value))
                }
              />
            </label>
            <label className="grid min-w-0 gap-[.35rem] text-[.64rem] font-semibold">
              Due date
              <DateField
                label={`Due date for ${item.title}`}
                onChange={(value) => edit(index, "dueAt", value)}
                showInlineLabel={false}
                value={item.dueAt ?? ""}
              />
            </label>
            <label className="grid min-w-0 gap-[.35rem] text-[.64rem] font-semibold">
              Status
              <SelectControl
                ariaLabel="Milestone status"
                onValueChange={(value) => edit(index, "status", value)}
                options={milestoneStatusOptions}
                value={item.status}
              />
            </label>
            <button
              aria-label="Remove milestone"
              className="flex h-12 w-12 cursor-pointer items-center justify-center rounded-control border-0 bg-transparent text-ink-muted hover:bg-danger-soft hover:text-danger"
              onClick={() =>
                setItems((current) =>
                  current.filter((_, itemIndex) => itemIndex !== index),
                )
              }
              type="button"
            >
              <Trash2 aria-hidden="true" size={16} />
            </button>
          </article>
        ))}
      </div>
      {items.length ? (
        <ButtonControl compact onClick={addMilestone} variant="add-another">
          <Plus size={15} /> Add another milestone
        </ButtonControl>
      ) : null}
      <p
        className={cn(
          "m-0 rounded-[2px] border-l-[3px] px-4 py-[.9rem]",
          weight === 100
            ? "border-brand bg-brand-soft"
            : "border-gold bg-gold-soft",
        )}
      >
        {items.reduce((sum, item) => sum + item.weight, 0)}% allocated. Public
        projects require exactly 100%.
      </p>
      <ButtonControl
        className="justify-self-end max-[640px]:w-full"
        disabled={busy}
        loading={busy}
        onClick={() => save(items)}
        variant="primary"
      >
        <Save size={15} /> Save milestones
      </ButtonControl>
    </div>
  );
}

function Updates({
  project,
  busy,
  save,
}: {
  project: WorkspaceProject;
  busy: boolean;
  save: (body: object) => void;
}) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  return (
    <div className="grid min-w-0 gap-5">
      <header className="flex items-end justify-between gap-4">
        <p className="mb-[.42rem] font-mono text-[.61rem] font-semibold tracking-[.11em] text-brand uppercase">
          Project activity
        </p>
        <h2 className="mt-[.4rem] mb-0 font-sans text-[clamp(1.6rem,3vw,2.3rem)] font-normal">
          Post an update
        </h2>
      </header>
      <div className="grid grid-cols-2 gap-4 border-y border-line-strong bg-transparent p-[1.2rem] max-[640px]:grid-cols-1">
        <InputControl
          placeholder="Update title"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
        />
        <TextareaControl
          placeholder="What changed, what evidence was added, and what happens next?"
          value={body}
          onChange={(event) => setBody(event.target.value)}
        />
        <div className="flex justify-end gap-[.6rem] max-[640px]:col-span-full">
          <ButtonControl
            disabled={busy}
            loading={busy}
            onClick={() => save({ title, body, status: "DRAFT" })}
          >
            Save draft
          </ButtonControl>
          <ButtonControl
            disabled={busy}
            loading={busy}
            onClick={() => save({ title, body, status: "PUBLISHED" })}
            variant="primary"
          >
            Publish <Send size={14} />
          </ButtonControl>
        </div>
      </div>
      <div className="grid border-t border-line">
        {project.updates.map((item) => (
          <article
            className="grid grid-cols-[100px_1fr] gap-4 border-b border-line py-4"
            key={item.id}
          >
            <time className="font-mono text-[.58rem] text-ink-faint uppercase">
              {new Date(item.createdAt).toLocaleDateString()}
            </time>
            <div>
              <span className="font-mono text-[.58rem] text-ink-faint uppercase">
                {item.status}
              </span>
              <h3 className="my-1 font-sans text-[1.2rem] font-normal">
                {item.title}
              </h3>
              <p className="text-[.75rem] leading-[1.55] text-ink-muted">
                {item.body}
              </p>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

function People({
  project,
  busy,
  save,
}: {
  project: WorkspaceProject;
  busy: boolean;
  save: (body: object) => void;
}) {
  const [people, setPeople] = useState<LinkablePerson[]>([]);
  const [personId, setPersonId] = useState("");
  const [access, setAccess] = useState("VIEW");
  useEffect(() => {
    let active = true;
    void apiRequest<{ people: LinkablePerson[] }>("/projects/options", {
      method: "GET",
    })
      .then(({ people: nextPeople }) => {
        if (active) setPeople(nextPeople);
      })
      .catch(() => {
        if (active) setPeople([]);
      });
    return () => {
      active = false;
    };
  }, []);
  const memberIds = new Set(project.memberships.map((item) => item.person.id));
  const options = people
    .filter((person) => !memberIds.has(person.id))
    .map((person) => ({ label: person.fullName, value: person.id }));
  return (
    <div className="grid min-w-0 gap-5">
      <header className="flex items-end justify-between gap-4">
        <p className="mb-[.42rem] font-mono text-[.61rem] font-semibold tracking-[.11em] text-brand uppercase">
          Contributor access
        </p>
        <h2 className="mt-[.4rem] mb-0 font-sans text-[clamp(1.6rem,3vw,2.3rem)] font-normal">
          Project team
        </h2>
      </header>
      <div className="grid border-t border-line">
        {project.memberships.map((item) => (
          <article
            className="grid grid-cols-[1fr_160px_160px] items-center gap-4 border-b border-line p-[.9rem]"
            key={item.id}
          >
            <div className="grid">
              <strong>{item.person.fullName}</strong>
              <span className="text-[.68rem] text-ink-muted">
                {item.status}
              </span>
            </div>
            <span className="text-[.68rem] text-ink-muted">{item.role}</span>
            <span className="text-[.68rem] text-ink-muted">
              {item.access.replaceAll("_", " ")}
            </span>
          </article>
        ))}
      </div>
      <form
        className="grid grid-cols-[minmax(200px,1fr)_minmax(130px,.35fr)_auto] items-end gap-[.8rem] border-y border-line-strong bg-transparent p-4 max-[640px]:grid-cols-1"
        onSubmit={(event) => {
          event.preventDefault();
          save({
            personId,
            access,
            role: access === "MANAGE" ? "MANAGER" : "CONTRIBUTOR",
          });
        }}
      >
        <label className="grid gap-[.35rem] text-[.64rem] font-semibold">
          Registered member
          <SearchableSelect
            ariaLabel="Project member"
            emptyMessage="No registered people found."
            onValueChange={setPersonId}
            options={options}
            placeholder="Search registered person…"
            searchPlaceholder="Search people…"
            value={personId}
          />
        </label>
        <label className="grid gap-[.35rem] text-[.64rem] font-semibold">
          Access
          <SelectControl
            ariaLabel="Project access"
            onValueChange={setAccess}
            options={accessOptions}
            value={access}
          />
        </label>
        <ButtonControl
          disabled={busy || !personId}
          loading={busy}
          type="submit"
        >
          Add member
        </ButtonControl>
      </form>
    </div>
  );
}

function Outputs({
  project,
  busy,
  output,
  resource,
}: {
  project: WorkspaceProject;
  busy: boolean;
  output: (body: object) => void;
  resource: (body: object) => void;
}) {
  const [outputId, setOutputId] = useState("");
  const [outputQuery, setOutputQuery] = useState("");
  const [outputOptions, setOutputOptions] = useState<OutputSearchResult[]>([]);
  const [searchingOutputs, setSearchingOutputs] = useState(false);
  const [label, setLabel] = useState("");
  const [url, setUrl] = useState("");
  useEffect(() => {
    const query = outputQuery.trim();
    if (query.length < 2) {
      return;
    }
    let active = true;
    const timeout = window.setTimeout(() => {
      setSearchingOutputs(true);
      void apiRequest<OutputSearchResult[]>(
        `/research-connections/search?query=${encodeURIComponent(query)}`,
        { method: "GET" },
      )
        .then((items) => {
          if (!active) return;
          setOutputOptions(items.filter((item) => item.type !== "PROJECT"));
        })
        .catch(() => {
          if (active) setOutputOptions([]);
        })
        .finally(() => {
          if (active) setSearchingOutputs(false);
        });
    }, 250);
    return () => {
      active = false;
      window.clearTimeout(timeout);
    };
  }, [outputQuery]);
  return (
    <div className="grid min-w-0 gap-5">
      <header className="flex items-end justify-between gap-4">
        <p className="mb-[.42rem] font-mono text-[.61rem] font-semibold tracking-[.11em] text-brand uppercase">
          Connected records
        </p>
        <h2 className="mt-[.4rem] mb-0 font-sans text-[clamp(1.6rem,3vw,2.3rem)] font-normal">
          Research outputs
        </h2>
      </header>
      <div className="grid border-t border-line">
        {project.researchItem.projectOutputs.map(({ output: item }) => (
          <article
            className="grid grid-cols-[90px_1fr_auto] items-center gap-4 border-b border-line py-4"
            key={item.id}
          >
            <span className="font-mono text-[.58rem] text-ink-faint uppercase">
              {item.type}
            </span>
            <strong>{item.title}</strong>
          </article>
        ))}
        {project.resources.map((item) => (
          <a
            className="grid grid-cols-[90px_1fr_auto] items-center gap-4 border-b border-line py-4"
            href={item.url}
            key={item.id}
            rel="noreferrer"
            target="_blank"
          >
            <span className="font-mono text-[.58rem] text-ink-faint uppercase">
              {item.kind}
            </span>
            <strong>{item.label}</strong>
            <ArrowUpRight size={15} />
          </a>
        ))}
      </div>
      <form
        className="grid grid-cols-[minmax(200px,1fr)_minmax(130px,.35fr)_auto] items-end gap-[.8rem] border-y border-line-strong bg-transparent p-4 max-[640px]:grid-cols-1"
        onSubmit={(event) => {
          event.preventDefault();
          output({ outputId });
        }}
      >
        <label className="grid gap-[.35rem] text-[.64rem] font-semibold">
          Published paper or dataset
          <SearchableSelect
            ariaLabel="Published paper or dataset"
            emptyMessage={
              outputQuery.trim().length < 2
                ? "Type at least two characters."
                : "No matching papers or datasets."
            }
            filterOptions={false}
            loading={searchingOutputs}
            onQueryChange={(query) => {
              setOutputQuery(query);
              if (query.trim().length < 2) {
                setOutputOptions([]);
                setSearchingOutputs(false);
              }
            }}
            onValueChange={setOutputId}
            options={outputOptions.map((item) => ({
              description: item.type.toLowerCase(),
              label: item.title ?? "Untitled output",
              value: item.id,
            }))}
            placeholder="Search published output…"
            searchPlaceholder="Search title, URL, or contributor…"
            value={outputId}
          />
        </label>
        <ButtonControl
          disabled={busy || !outputId}
          loading={busy}
          type="submit"
        >
          Link output
        </ButtonControl>
      </form>
      <form
        className="grid grid-cols-[minmax(200px,1fr)_minmax(130px,.35fr)_auto] items-end gap-[.8rem] border-y border-line-strong bg-transparent p-4 max-[640px]:grid-cols-1"
        onSubmit={(event) => {
          event.preventDefault();
          resource({ label, url, kind: "LINK" });
        }}
      >
        <label className="grid gap-[.35rem] text-[.64rem] font-semibold">
          Resource label
          <InputControl
            required
            value={label}
            onChange={(event) => setLabel(event.target.value)}
          />
        </label>
        <label className="grid gap-[.35rem] text-[.64rem] font-semibold">
          URL
          <InputControl
            type="url"
            required
            value={url}
            onChange={(event) => setUrl(event.target.value)}
          />
        </label>
        <ButtonControl
          disabled={busy}
          loading={busy}
          type="submit"
          variant="primary"
        >
          Add resource
        </ButtonControl>
      </form>
    </div>
  );
}

function Settings({
  project,
  busy,
  save,
  archive,
}: {
  project: WorkspaceProject;
  busy: boolean;
  save: (body: object) => void;
  archive: () => void;
}) {
  const [title, setTitle] = useState(project.researchItem.title ?? "");
  const [summary, setSummary] = useState(project.researchItem.summary ?? "");
  const [objective, setObjective] = useState(project.objective ?? "");
  const [status, setStatus] = useState(project.status ?? "ACTIVE");
  const [publicPageEnabled, setPublic] = useState(project.publicPageEnabled);
  return (
    <div className="grid min-w-0 gap-5">
      <header className="flex items-end justify-between gap-4">
        <p className="mb-[.42rem] font-mono text-[.61rem] font-semibold tracking-[.11em] text-brand uppercase">
          Project configuration
        </p>
        <h2 className="mt-[.4rem] mb-0 font-sans text-[clamp(1.6rem,3vw,2.3rem)] font-normal">
          Settings
        </h2>
      </header>
      <form
        className="grid grid-cols-2 gap-4 border-y border-line-strong bg-transparent p-[1.2rem] max-[640px]:grid-cols-1"
        onSubmit={(event) => {
          event.preventDefault();
          save({
            title,
            summary,
            objective,
            status,
            publicPageEnabled,
            startsAt: project.startsAt,
            endsAt: project.endsAt,
            objectives: project.objectives.map(
              ({ title: itemTitle, description }) => ({
                title: itemTitle,
                description,
              }),
            ),
          });
        }}
      >
        <label className="grid gap-[.35rem] text-[.64rem] font-semibold">
          Public title
          <InputControl
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
        </label>
        <label className="grid gap-[.35rem] text-[.64rem] font-semibold">
          Schedule status
          <SelectControl
            ariaLabel="Project status"
            onValueChange={setStatus}
            options={projectStatusOptions}
            value={status}
          />
        </label>
        <label className="col-span-full grid gap-[.35rem] text-[.64rem] font-semibold max-[640px]:col-auto">
          Public summary
          <TextareaControl
            value={summary}
            onChange={(event) => setSummary(event.target.value)}
          />
        </label>
        <label className="col-span-full grid gap-[.35rem] text-[.64rem] font-semibold max-[640px]:col-auto">
          Main objective
          <TextareaControl
            value={objective}
            onChange={(event) => setObjective(event.target.value)}
          />
        </label>
        <CheckboxControl
          checked={publicPageEnabled}
          id="project-public-page"
          onCheckedChange={setPublic}
        >
          Public project page enabled
        </CheckboxControl>
        <ButtonControl
          className="col-span-full justify-self-end max-[640px]:w-full"
          disabled={busy}
          type="submit"
          variant="primary"
        >
          <Save size={15} /> Save settings
        </ButtonControl>
      </form>
      {project.researchItem.reviewStatus !== "ARCHIVED" ? (
        <div className="flex items-center justify-between border border-danger/35 bg-danger-soft p-4 max-[640px]:items-stretch max-[640px]:flex-col max-[640px]:gap-3">
          <div>
            <strong>Archive project</strong>
            <p className="m-0 text-[.75rem] leading-[1.55] text-ink-muted">
              Remove it from active listings while retaining its verified
              record.
            </p>
          </div>
          <ButtonControl disabled={busy} onClick={archive} variant="danger">
            Archive
          </ButtonControl>
        </div>
      ) : null}
    </div>
  );
}

function projectDeadlineSummary(project: WorkspaceProject) {
  const now = new Date();
  const soon = new Date(now);
  soon.setDate(now.getDate() + 7);
  const openTasks = project.tasks.filter((item) => item.status !== "DONE");
  const openMilestones = project.milestones.filter(
    (item) => item.status !== "COMPLETE",
  );
  const overdue = (value: string | null) =>
    Boolean(value && new Date(value) < now);
  const dueSoon = (value: string | null) =>
    Boolean(value && new Date(value) >= now && new Date(value) <= soon);
  return {
    overdueTasks: openTasks.filter((item) => overdue(item.dueAt)).length,
    dueSoonTasks: openTasks.filter((item) => dueSoon(item.dueAt)).length,
    blockedTasks: openTasks.filter((item) => item.status === "BLOCKED").length,
    overdueMilestones: openMilestones.filter((item) => overdue(item.dueAt))
      .length,
    dueSoonMilestones: openMilestones.filter((item) => dueSoon(item.dueAt))
      .length,
    blockedMilestones: openMilestones.filter(
      (item) => item.status === "BLOCKED",
    ).length,
  };
}

function emptyProject(id: string): WorkspaceProject {
  return {
    changeRequests: [],
    endsAt: null,
    invitations: [],
    memberships: [],
    milestones: [],
    tasks: [],
    objective: null,
    objectives: [],
    progress: 0,
    publicPageEnabled: false,
    researchItem: {
      id,
      projectOutputs: [],
      reviewStatus: "DRAFT",
      slug: "",
      summary: null,
      title: null,
    },
    researchItemId: id,
    resources: [],
    startsAt: null,
    status: null,
    updates: [],
  };
}
