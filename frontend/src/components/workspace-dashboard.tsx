"use client";

import { loadingPlaceholder } from "@/lib/loading-style";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  Building2,
  CheckSquare2,
  ClipboardCheck,
  FolderKanban,
  NotebookPen,
  Plus,
  Users,
} from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { useNotifications } from "@/components/notification-provider";
import { StatePanel } from "@/components/state-panel";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { ButtonControl } from "@/components/ui/button-control";
import { LineChart } from "@/components/ui/charts";
import {
  WorkspaceEmpty,
  WorkspaceHero,
  WorkspaceMetric,
  WorkspaceMetricStrip,
  WorkspacePanel,
  WorkspaceSplit,
  WorkspaceSurface,
} from "@/components/ui/workspace-surface";
import { apiRequest } from "@/lib/client-api";
import { cn } from "@/lib/cn";

interface WorkspaceOverview {
  lab: { departments: number; people: number };
  metrics: {
    activeProjects: number;
    assignedTasks: number;
    blockedTasks: number;
    overdueTasks: number;
    dueSoonTasks: number;
    overdueMilestones: number;
    dueSoonMilestones: number;
    outputs: number;
    projects: number;
  };
  projects: Array<{
    id: string;
    title: string;
    summary: string | null;
    status: string | null;
    progress: number;
    memberCount: number;
    openTaskCount: number;
    blockedTaskCount: number;
  }>;
  milestones: Array<{
    id: string;
    projectId: string;
    projectTitle: string;
    title: string;
    status: string;
    progress: number;
    dueAt: string | null;
    owner: string | null;
  }>;
  taskProgress: Array<{ week: string; completed: number; due: number }>;
  taskStatus: {
    blocked: number;
    done: number;
    inProgress: number;
    todo: number;
  };
  tasks: Array<{
    id: string;
    projectId: string;
    projectTitle: string;
    title: string;
    status: string;
    priority: string;
    dueAt: string | null;
  }>;
}

export function WorkspaceDashboard() {
  const { user } = useAuth();
  const { queueCounts, unreadCount } = useNotifications();
  const [overview, setOverview] = useState<WorkspaceOverview>();
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let active = true;
    apiRequest<WorkspaceOverview>("/workspace/overview", { method: "GET" })
      .then((result) => {
        if (active) {
          setOverview(result);
          setError("");
        }
      })
      .catch((caught: unknown) => {
        if (active)
          setError(
            caught instanceof Error
              ? caught.message
              : "The lab overview could not be loaded.",
          );
      });
    return () => {
      active = false;
    };
  }, [reload]);

  const delivery = overview?.metrics;
  const loadingOverview = !overview && !error;
  const staff = user?.role === "ADMIN" || user?.role === "MODERATOR";
  const pendingReviews =
    queueCounts.profileReviews +
    queueCounts.projectReviews +
    queueCounts.researchReviews +
    queueCounts.weeklyReportReviews +
    (user?.role === "ADMIN" ? queueCounts.applications : 0);
  const operationalRisk =
    (delivery?.overdueTasks ?? 0) +
    (delivery?.blockedTasks ?? 0) +
    (delivery?.overdueMilestones ?? 0);
  const alertSummary = useMemo(() => {
    if (!delivery) return "Checking task and milestone deadlines…";
    return [
      `${delivery.overdueTasks} overdue task${delivery.overdueTasks === 1 ? "" : "s"}`,
      `${delivery.dueSoonTasks} due this week`,
      `${delivery.overdueMilestones} overdue milestone${delivery.overdueMilestones === 1 ? "" : "s"}`,
      `${delivery.blockedTasks} blocked`,
    ].join(" · ");
  }, [delivery]);

  if (!user) return null;
  const firstName = greetingName(user.person?.fullName);

  return (
    <WorkspaceSurface measure="wide">
      <WorkspaceHero
        action={
          user.role === "ADMIN" ? (
            <Link href="/workspace/projects/new">
              <ButtonControl
                className="pointer-events-none"
                tabIndex={-1}
                variant="primary"
              >
                <Plus aria-hidden="true" size={15} /> New project
              </ButtonControl>
            </Link>
          ) : undefined
        }
        description={
          staff
            ? "A moderation register for pending research, project and profile decisions, plus lab-wide delivery risk."
            : "A deadline-aware register for your projects, tasks, milestones and published research. The first screen answers what needs action now."
        }
        eyebrow="AMIRLab / operations register"
        meta={
          <>
            <span>{formattedDate()}</span>
            <span>{overview?.metrics.projects ?? "—"} accessible projects</span>
            <span>{overview?.lab.people ?? "—"} registered people</span>
          </>
        }
        title={
          <>
            Good {dayPeriod()}, {firstName}.
          </>
        }
      />

      {error && !overview ? (
        <StatePanel
          action={{
            label: "Try again",
            onClick: () => setReload((value) => value + 1),
          }}
          body={error}
          title="Could not load the lab register"
          variant="error"
        />
      ) : null}

      <section
        aria-label="Operational agenda"
        className="grid min-h-[84px] grid-cols-[72px_minmax(0,1fr)_210px_auto] items-stretch border-y border-line-strong bg-surface max-[1050px]:grid-cols-[56px_minmax(0,1fr)_170px] max-[700px]:grid-cols-[48px_1fr]"
        data-loading={loadingOverview || undefined}
      >
        <div className="flex items-center justify-center border-r border-line font-mono text-[.64rem] tracking-[.11em] text-brand">
          NOW
        </div>
        <div className="grid content-center gap-[.22rem] px-[1.1rem] py-[.9rem]">
          <strong
            className={cn(
              "font-sans text-[1.15rem] font-medium",
              loadingPlaceholder(loadingOverview, "text"),
            )}
            data-placeholder={loadingOverview ? "text" : undefined}
          >
            {loadingOverview
              ? "Checking delivery register"
              : staff
                ? pendingReviews
                  ? "Review attention required"
                  : "Review register is clear"
                : operationalRisk
                  ? "Delivery attention required"
                  : "Delivery register is clear"}
          </strong>
          <p
            className={cn(
              "m-0 text-[.75rem] text-ink-muted",
              loadingPlaceholder(loadingOverview, "text"),
            )}
            data-placeholder={loadingOverview ? "text" : undefined}
          >
            {staff
              ? `${pendingReviews} pending review${pendingReviews === 1 ? "" : "s"} · ${unreadCount} unread notices`
              : alertSummary}
          </p>
        </div>
        <div className="grid content-center grid-cols-[1fr_auto] border-l border-line px-4 py-[.8rem] max-[700px]:col-span-full max-[700px]:border-t max-[700px]:border-l-0 max-[700px]:pl-[calc(48px+.9rem)]">
          <span className="font-mono text-[.58rem] tracking-[.08em] text-ink-muted uppercase">
            {staff ? "Decision queue" : "Unread notices"}
          </span>
          <strong
            className={cn(
              "row-span-2 font-mono text-[1.35rem] font-medium",
              loadingPlaceholder(loadingOverview, "value"),
            )}
            data-placeholder={loadingOverview ? "value" : undefined}
          >
            {loadingOverview ? "00" : staff ? pendingReviews : unreadCount}
          </strong>
          <small
            className={cn(
              "text-[.68rem] text-ink-muted",
              loadingPlaceholder(loadingOverview, "text"),
            )}
            data-placeholder={loadingOverview ? "text" : undefined}
          >
            {staff
              ? `${unreadCount} unread notices`
              : `${overview?.tasks.length ?? 0} open assignments`}
          </small>
        </div>
        {loadingOverview ? (
          <span
            aria-hidden="true"
            className="flex w-[150px] items-center border-l border-line p-4 max-[1050px]:hidden"
          >
            <span className={loadingPlaceholder(true, "text", "full")} />
          </span>
        ) : (
          <Link
            className="flex items-center gap-[.4rem] border-l border-line p-4 text-[.72rem] font-semibold whitespace-nowrap text-brand hover:bg-brand-faint max-[1050px]:hidden"
            href={staff ? "/workspace/research" : "/workspace/tasks"}
          >
            {staff ? "Open review queue" : "Open due work"}{" "}
            <ArrowRight aria-hidden="true" size={15} />
          </Link>
        )}
      </section>

      {staff ? (
        <WorkspaceMetricStrip>
          <WorkspaceMetric
            detail="Profiles waiting for a moderation decision"
            label="Profile reviews"
            tone={queueCounts.profileReviews ? "attention" : "neutral"}
            value={queueCounts.profileReviews}
          />
          <WorkspaceMetric
            detail="Papers and datasets waiting for verification"
            label="Research reviews"
            tone={queueCounts.researchReviews ? "attention" : "neutral"}
            value={queueCounts.researchReviews}
          />
          <WorkspaceMetric
            detail="Project changes waiting for approval"
            label="Project reviews"
            tone={queueCounts.projectReviews ? "attention" : "neutral"}
            value={queueCounts.projectReviews}
          />
          <WorkspaceMetric
            detail="Published records currently indexed"
            label="Research outputs"
            tone="success"
            value={delivery?.outputs ?? "—"}
          />
        </WorkspaceMetricStrip>
      ) : (
        <WorkspaceMetricStrip>
          <WorkspaceMetric
            detail={`${delivery?.dueSoonTasks ?? 0} due in the next 7 days`}
            label="My open tasks"
            tone={(delivery?.overdueTasks ?? 0) ? "attention" : "brand"}
            value={delivery?.assignedTasks ?? "—"}
          />
          <WorkspaceMetric
            detail={`${delivery?.overdueMilestones ?? 0} milestone deadlines passed`}
            label="Overdue work"
            tone={
              (delivery?.overdueTasks ?? 0) + (delivery?.overdueMilestones ?? 0)
                ? "attention"
                : "success"
            }
            value={
              (delivery?.overdueTasks ?? 0) + (delivery?.overdueMilestones ?? 0)
            }
          />
          <WorkspaceMetric
            detail={`${delivery?.blockedTasks ?? 0} tasks need an owner or decision`}
            label="Active projects"
            value={delivery?.activeProjects ?? "—"}
          />
          <WorkspaceMetric
            detail="Outputs submitted by you"
            label="Research outputs"
            tone="success"
            value={delivery?.outputs ?? "—"}
          />
        </WorkspaceMetricStrip>
      )}

      {!staff ? (
        <WorkspaceSplit>
          <WorkspacePanel
            action={
              <Link
                className="inline-flex items-center gap-[.35rem] text-[.7rem] font-semibold whitespace-nowrap text-brand"
                href="/workspace/tasks"
              >
                Task register <ArrowRight size={14} />
              </Link>
            }
            description="Upcoming milestones are ordered by due date. Passed deadlines remain visible until completed."
            eyebrow="Milestone ledger"
            title="Next delivery points"
          >
            {overview?.milestones.length || loadingOverview ? (
              <div className="grid" data-loading={loadingOverview || undefined}>
                {(
                  overview?.milestones ??
                  Array.from({ length: 5 }, (_, index) => ({
                    id: `loading-milestone-${index}`,
                    projectId: "",
                    projectTitle: "Research project",
                    title: "Milestone title",
                    status: "PLANNED",
                    progress: 0,
                    dueAt: null,
                    owner: "Project owner",
                  }))
                ).map((milestone, index) => {
                  const dueState = loadingOverview
                    ? "none"
                    : deadlineState(milestone.dueAt);
                  return (
                    <Link
                      aria-disabled={loadingOverview || undefined}
                      className="grid min-h-[74px] grid-cols-[88px_18px_minmax(0,1fr)_82px] items-stretch border-t border-line px-4 first:border-t-0 hover:bg-brand-faint max-[700px]:grid-cols-[70px_16px_minmax(0,1fr)] max-[700px]:px-[.7rem]"
                      data-state={dueState}
                      href={
                        loadingOverview
                          ? "#"
                          : `/workspace/projects/${milestone.projectId}`
                      }
                      key={milestone.id}
                      tabIndex={loadingOverview ? -1 : undefined}
                    >
                      <time
                        className="grid content-center gap-[.15rem]"
                        dateTime={milestone.dueAt ?? undefined}
                      >
                        <span className="font-mono text-[.54rem] text-ink-faint">
                          {String(index + 1).padStart(2, "0")}
                        </span>
                        <strong
                          className={cn(
                            "font-mono text-[.67rem] font-medium",
                            loadingPlaceholder(loadingOverview, "text"),
                          )}
                          data-placeholder={
                            loadingOverview ? "text" : undefined
                          }
                        >
                          {loadingOverview
                            ? "00 Mon"
                            : milestone.dueAt
                              ? shortDate(milestone.dueAt)
                              : "No date"}
                        </strong>
                      </time>
                      <span
                        aria-hidden="true"
                        className="relative border-l border-line-strong before:absolute before:top-[31px] before:-left-[5px] before:h-2 before:w-2 before:rounded-full before:border-2 before:border-brand before:bg-surface before:content-['']"
                      />
                      <div className="grid content-center gap-[.12rem] pl-[.9rem]">
                        <span
                          className={cn(
                            "font-mono text-[.55rem] text-ink-muted uppercase",
                            loadingPlaceholder(loadingOverview, "text"),
                          )}
                          data-placeholder={
                            loadingOverview ? "text" : undefined
                          }
                        >
                          {milestone.projectTitle}
                        </span>
                        <strong
                          className={cn(
                            "font-sans text-[.92rem] font-medium",
                            loadingPlaceholder(loadingOverview, "text"),
                          )}
                          data-placeholder={
                            loadingOverview ? "text" : undefined
                          }
                        >
                          {milestone.title}
                        </strong>
                        <small
                          className={cn(
                            "text-[.65rem] text-ink-muted",
                            loadingPlaceholder(loadingOverview, "text"),
                          )}
                          data-placeholder={
                            loadingOverview ? "text" : undefined
                          }
                        >
                          {milestone.owner ?? "Unassigned"} ·{" "}
                          {milestone.progress}% complete
                        </small>
                      </div>
                      <em
                        className={cn(
                          cn(
                            "self-center text-right font-mono text-[.55rem] not-italic uppercase max-[700px]:hidden",
                            dueState === "overdue"
                              ? "text-danger"
                              : dueState === "soon"
                                ? "text-annotation"
                                : "text-ink-muted",
                          ),
                          loadingPlaceholder(loadingOverview, "text"),
                        )}
                        data-placeholder={loadingOverview ? "text" : undefined}
                      >
                        {loadingOverview ? "Scheduled" : dueLabel(dueState)}
                      </em>
                    </Link>
                  );
                })}
              </div>
            ) : (
              <WorkspaceEmpty>
                No dated milestones are currently open.
              </WorkspaceEmpty>
            )}
          </WorkspacePanel>

          <WorkspacePanel
            description="Due and completed tasks by week. A delivery gap is visible before it becomes an overdue queue."
            eyebrow="Delivery signal"
            title="Eight-week throughput"
          >
            <LineChart
              ariaLabel="Weekly due and completed project tasks"
              labels={(overview?.taskProgress ?? emptyWeeks()).map(({ week }) =>
                chartWeek(week),
              )}
              series={[
                {
                  color: "var(--brand)",
                  label: "Due",
                  values: (overview?.taskProgress ?? emptyWeeks()).map(
                    ({ due }) => due,
                  ),
                },
                {
                  color: "var(--success)",
                  label: "Completed",
                  values: (overview?.taskProgress ?? emptyWeeks()).map(
                    ({ completed }) => completed,
                  ),
                },
              ]}
            />
            <div className="mt-2 grid grid-cols-4 border-t border-line max-[700px]:grid-cols-2">
              <StatusCell
                label="To do"
                value={overview?.taskStatus.todo ?? "—"}
              />
              <StatusCell
                label="In progress"
                tone="brand"
                value={overview?.taskStatus.inProgress ?? "—"}
              />
              <StatusCell
                label="Blocked"
                tone="danger"
                value={overview?.taskStatus.blocked ?? "—"}
              />
              <StatusCell
                label="Done"
                tone="success"
                value={overview?.taskStatus.done ?? "—"}
              />
            </div>
          </WorkspacePanel>
        </WorkspaceSplit>
      ) : null}

      <section
        aria-labelledby="quick-actions-title"
        className="grid gap-[.65rem]"
      >
        <div className="flex items-baseline justify-between gap-4">
          <span
            className="font-mono text-[.61rem] font-semibold tracking-[.1em] uppercase"
            id="quick-actions-title"
          >
            Common operations
          </span>
          <small className="text-[.68rem] text-ink-muted">
            Shortcuts into the lab record
          </small>
        </div>
        <div className="grid grid-cols-4 border-y border-line max-[1050px]:grid-cols-2 max-[700px]:grid-cols-1">
          {staff ? (
            <>
              {user.role === "ADMIN" ? (
                <QuickAction
                  body="Define scope, milestones, team and delivery dates."
                  href="/workspace/projects/new"
                  icon={FolderKanban}
                  title="Create project"
                />
              ) : null}
              <QuickAction
                body="Resolve paper and dataset identity and publication checks."
                href="/workspace/research"
                icon={ClipboardCheck}
                title="Papers & datasets review"
              />
              <QuickAction
                body="Review public profile changes and imported member records."
                href="/workspace/profile-reviews"
                icon={Users}
                title="Profile review"
              />
              <QuickAction
                body="Review project creation and change requests."
                href="/workspace/project-reviews"
                icon={FolderKanban}
                title="Project review"
              />
            </>
          ) : (
            <>
              <QuickAction
                body="Create a project proposal for review."
                href="/workspace/projects/new"
                icon={FolderKanban}
                title="Create project"
              />
              <QuickAction
                body="Record outcomes, blockers and next-week commitments."
                href="/workspace/weekly-reports"
                icon={NotebookPen}
                title="Weekly report"
              />
              <QuickAction
                body="Review assignments across all accessible projects."
                href="/workspace/tasks"
                icon={CheckSquare2}
                title="My task register"
              />
              <QuickAction
                body="Read decisions, invitations and project activity."
                href="/workspace/notifications"
                icon={ClipboardCheck}
                title="Activity record"
              />
            </>
          )}
        </div>
      </section>

      <WorkspaceSplit>
        <WorkspacePanel
          action={
            <Link
              className="inline-flex items-center gap-[.35rem] text-[.7rem] font-semibold whitespace-nowrap text-brand"
              href="/workspace/projects"
            >
              Full portfolio <ArrowRight size={14} />
            </Link>
          }
          description="Current research initiatives with progress and unresolved work."
          eyebrow="Research portfolio"
          title="Project register"
        >
          {overview?.projects.length || loadingOverview ? (
            <div className="grid" data-loading={loadingOverview || undefined}>
              {(
                overview?.projects ??
                Array.from({ length: 3 }, (_, index) => ({
                  id: `loading-project-${index}`,
                  title: "Research project title",
                  summary: null,
                  status: "PLANNED",
                  progress: 0,
                  memberCount: 0,
                  openTaskCount: 0,
                  blockedTaskCount: 0,
                }))
              ).map((project) => (
                <Link
                  aria-disabled={loadingOverview || undefined}
                  className="grid gap-[.55rem] border-t border-line px-4 py-[.9rem] first:border-t-0 hover:bg-brand-faint"
                  href={
                    loadingOverview ? "#" : `/workspace/projects/${project.id}`
                  }
                  key={project.id}
                  tabIndex={loadingOverview ? -1 : undefined}
                >
                  <div className="flex items-end justify-between gap-4">
                    <div className="grid min-w-0 gap-[.3rem]">
                      <Badge
                        dot
                        loading={loadingOverview}
                        tone={statusTone(project.status)}
                      >
                        {formatStatus(project.status ?? "PLANNED")}
                      </Badge>
                      <strong
                        className={cn(
                          "overflow-hidden text-ellipsis whitespace-nowrap font-sans text-[.95rem] font-medium",
                          loadingPlaceholder(loadingOverview, "text"),
                        )}
                        data-placeholder={loadingOverview ? "text" : undefined}
                      >
                        {project.title}
                      </strong>
                    </div>
                    <span
                      className={cn(
                        "font-mono text-[.68rem] text-brand",
                        loadingPlaceholder(loadingOverview, "value"),
                      )}
                      data-placeholder={loadingOverview ? "value" : undefined}
                    >
                      {loadingOverview ? "00%" : `${project.progress}%`}
                    </span>
                  </div>
                  <svg
                    aria-hidden="true"
                    className="h-[2px] w-full"
                    preserveAspectRatio="none"
                    viewBox="0 0 100 2"
                  >
                    <rect className="fill-line" height="2" width="100" />
                    <rect
                      className="fill-brand"
                      height="2"
                      width={project.progress}
                    />
                  </svg>
                  <small
                    className={cn(
                      "text-[.65rem] text-ink-muted",
                      loadingPlaceholder(loadingOverview, "text"),
                    )}
                    data-placeholder={loadingOverview ? "text" : undefined}
                  >
                    {project.memberCount} member
                    {project.memberCount === 1 ? "" : "s"} ·{" "}
                    {project.openTaskCount} open task
                    {project.openTaskCount === 1 ? "" : "s"}
                    {project.blockedTaskCount
                      ? ` · ${project.blockedTaskCount} blocked`
                      : ""}
                  </small>
                </Link>
              ))}
            </div>
          ) : (
            <WorkspaceEmpty>
              No project workspace is available yet.
            </WorkspaceEmpty>
          )}
        </WorkspacePanel>

        {staff ? (
          <WorkspacePanel
            description="Pending decisions across public profiles, research records and projects."
            eyebrow="Moderation"
            title="Decision queues"
          >
            <div className="grid">
              <QueueLink
                count={queueCounts.profileReviews}
                href="/workspace/profile-reviews"
                label="Profile reviews"
              />
              <QueueLink
                count={queueCounts.researchReviews}
                href="/workspace/research"
                label="Papers & datasets review"
              />
              <QueueLink
                count={queueCounts.projectReviews}
                href="/workspace/project-reviews"
                label="Project reviews"
              />
              {user.role === "ADMIN" ? (
                <QueueLink
                  count={queueCounts.applications}
                  href="/workspace/applications"
                  label="Applications"
                />
              ) : null}
            </div>
          </WorkspacePanel>
        ) : (
          <WorkspacePanel
            description="Your nearest open assignments, ordered by deadline."
            eyebrow="My work"
            title="Due task register"
          >
            {overview?.tasks.length || loadingOverview ? (
              <div className="grid" data-loading={loadingOverview || undefined}>
                {(
                  overview?.tasks ??
                  Array.from({ length: 4 }, (_, index) => ({
                    id: `loading-task-${index}`,
                    projectId: "",
                    projectTitle: "Research project",
                    title: "Assigned task",
                    status: "TODO",
                    priority: "MEDIUM",
                    dueAt: null,
                  }))
                ).map((task) => {
                  const state = loadingOverview
                    ? "none"
                    : deadlineState(task.dueAt);
                  return (
                    <Link
                      aria-disabled={loadingOverview || undefined}
                      className="grid min-h-[58px] grid-cols-[8px_minmax(0,1fr)_auto] items-center gap-[.7rem] border-t border-line px-4 py-[.65rem] first:border-t-0 hover:bg-brand-faint"
                      href={
                        loadingOverview
                          ? "#"
                          : `/workspace/projects/${task.projectId}`
                      }
                      key={task.id}
                      tabIndex={loadingOverview ? -1 : undefined}
                    >
                      <span
                        className={cn(
                          "h-[7px] w-[7px] rounded-full bg-line-strong",
                          task.status === "IN_PROGRESS" && "bg-brand",
                          task.status === "BLOCKED" && "bg-danger",
                        )}
                      />
                      <div className="grid min-w-0 gap-[.1rem]">
                        <strong
                          className={cn(
                            "overflow-hidden text-ellipsis whitespace-nowrap text-[.76rem]",
                            loadingPlaceholder(loadingOverview, "text"),
                          )}
                          data-placeholder={
                            loadingOverview ? "text" : undefined
                          }
                        >
                          {task.title}
                        </strong>
                        <small
                          className={cn(
                            "overflow-hidden text-ellipsis whitespace-nowrap text-[.63rem] text-ink-muted",
                            loadingPlaceholder(loadingOverview, "text"),
                          )}
                          data-placeholder={
                            loadingOverview ? "text" : undefined
                          }
                        >
                          {task.projectTitle} · {formatStatus(task.priority)}
                        </small>
                      </div>
                      <time
                        className={cn(
                          cn(
                            "font-mono text-[.59rem] text-ink-muted",
                            state === "overdue" && "font-semibold text-danger",
                            state === "soon" && "text-annotation",
                          ),
                          loadingPlaceholder(loadingOverview, "text"),
                        )}
                        data-placeholder={loadingOverview ? "text" : undefined}
                      >
                        {loadingOverview
                          ? "00 Mon"
                          : task.dueAt
                            ? shortDate(task.dueAt)
                            : "No date"}
                      </time>
                    </Link>
                  );
                })}
              </div>
            ) : (
              <WorkspaceEmpty>
                No open project tasks are assigned to you.
              </WorkspaceEmpty>
            )}
          </WorkspacePanel>
        )}
      </WorkspaceSplit>

      {user.role === "ADMIN" ? (
        <WorkspacePanel
          action={
            <Link
              className="inline-flex items-center gap-[.35rem] text-[.7rem] font-semibold whitespace-nowrap text-brand"
              href="/workspace/users"
            >
              Manage registry <ArrowRight size={14} />
            </Link>
          }
          description="The permanent organization behind projects, reviews and outputs."
          eyebrow="Organization"
          title="Lab registry"
        >
          <div className="grid grid-cols-3 max-[700px]:grid-cols-1">
            <RegistryLink
              href="/workspace/users"
              icon={Users}
              label="Available accounts"
              value={overview?.lab.people ?? "—"}
            />
            <RegistryLink
              href="/workspace/departments"
              icon={Building2}
              label="Departments"
              value={overview?.lab.departments ?? "—"}
            />
            <RegistryLink
              href="/workspace/applications"
              icon={ClipboardCheck}
              label="Applications awaiting review"
              value={queueCounts.applications}
            />
          </div>
        </WorkspacePanel>
      ) : null}
    </WorkspaceSurface>
  );
}

function QuickAction({
  body,
  href,
  icon: Icon,
  title,
}: {
  body: string;
  href: string;
  icon: typeof FolderKanban;
  title: string;
}) {
  return (
    <Link
      className="grid grid-cols-[24px_minmax(0,1fr)_auto] items-start gap-[.65rem] border-r border-line p-[.9rem] last:border-r-0 hover:bg-brand-faint max-[700px]:border-r-0 max-[700px]:border-b"
      href={href}
    >
      <Icon aria-hidden="true" className="mt-[2px] text-brand" size={17} />
      <span className="grid min-w-0 gap-[.15rem]">
        <strong className="text-[.78rem]">{title}</strong>
        <small className="text-[.68rem] leading-[1.45] text-ink-muted">
          {body}
        </small>
      </span>
      <ArrowRight
        aria-hidden="true"
        className="mt-[2px] text-ink-faint"
        size={14}
      />
    </Link>
  );
}
function StatusCell({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: React.ReactNode;
  tone?: "neutral" | "brand" | "danger" | "success";
}) {
  return (
    <span className="grid grid-cols-[6px_1fr_auto] items-center gap-[.3rem] border-r border-line px-[.65rem] py-[.7rem] text-[.62rem] text-ink-muted last:border-r-0">
      <i
        className={cn(
          "h-[6px] w-[6px] rounded-full bg-line-strong",
          tone === "brand" && "bg-brand",
          tone === "danger" && "bg-danger",
          tone === "success" && "bg-success",
        )}
      />
      {label}
      <strong className="font-mono text-[.67rem] text-ink">{value}</strong>
    </span>
  );
}
function QueueLink({
  count,
  href,
  label,
}: {
  count: number;
  href: string;
  label: string;
}) {
  return (
    <Link
      className="grid grid-cols-[1fr_auto] items-center border-t border-line px-4 py-3 first:border-t-0 hover:bg-brand-faint"
      href={href}
    >
      <span className="text-[.74rem]">{label}</span>
      <strong className="font-mono text-[.75rem] text-brand">{count}</strong>
    </Link>
  );
}
function RegistryLink({
  href,
  icon: Icon,
  label,
  value,
}: {
  href: string;
  icon: typeof Users;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <Link
      className="grid min-h-[105px] content-center gap-[.3rem] border-r border-line p-4 last:border-r-0 hover:bg-brand-faint max-[700px]:border-r-0 max-[700px]:border-b"
      href={href}
    >
      <Icon className="text-brand" size={18} />
      <strong className="font-mono text-[1.25rem] font-medium">{value}</strong>
      <span className="text-[.67rem] text-ink-muted">{label}</span>
    </Link>
  );
}
function statusTone(status: string | null): BadgeTone {
  if (status === "ACTIVE") return "success";
  if (status === "PAUSED") return "warning";
  return "neutral";
}
function formatStatus(value: string): string {
  return value
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/^./, (letter) => letter.toUpperCase());
}
function shortDate(value: string): string {
  return new Intl.DateTimeFormat("en", {
    day: "numeric",
    month: "short",
  }).format(new Date(value));
}
type DeadlineState = "overdue" | "soon" | "future" | "none";
function deadlineState(value: string | null): DeadlineState {
  if (!value) return "none";
  const now = new Date();
  const due = new Date(value);
  const soon = new Date(now);
  soon.setDate(now.getDate() + 7);
  if (due < now) return "overdue";
  if (due <= soon) return "soon";
  return "future";
}
function dueLabel(state: DeadlineState): string {
  if (state === "overdue") return "Overdue";
  if (state === "soon") return "Due ≤ 7d";
  if (state === "future") return "Scheduled";
  return "Unscheduled";
}
function dayPeriod(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "morning";
  if (hour < 18) return "afternoon";
  return "evening";
}
function greetingName(fullName: string | undefined): string {
  if (!fullName) return "researcher";
  const parts = fullName.trim().split(/\s+/);
  return parts[0].endsWith(".") && parts[1] ? parts[1] : parts[0];
}
function formattedDate(): string {
  return new Intl.DateTimeFormat("en", {
    day: "numeric",
    month: "long",
    weekday: "long",
    year: "numeric",
  }).format(new Date());
}
function emptyWeeks(): WorkspaceOverview["taskProgress"] {
  const today = new Date();
  return Array.from({ length: 8 }, (_, index) => {
    const week = new Date(today);
    week.setDate(today.getDate() - (7 - index) * 7);
    return { week: week.toISOString(), completed: 0, due: 0 };
  });
}
function chartWeek(value: string): string {
  return new Intl.DateTimeFormat("en", {
    day: "numeric",
    month: "short",
  }).format(new Date(value));
}
