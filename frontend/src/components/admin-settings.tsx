"use client";

import { cn } from "@/lib/cn";
import { loadingPlaceholder } from "@/lib/loading-style";
import { useEffect, useState } from "react";
import { Save, ShieldCheck } from "lucide-react";
import { AdminOnly } from "@/components/admin-only";
import { useNotifications } from "@/components/notification-provider";
import { StatePanel } from "@/components/state-panel";
import { InputControl } from "@/components/ui/form-controls";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { apiRequest } from "@/lib/client-api";
import { ButtonControl } from "@/components/ui/button-control";

type VerificationMode = "AUTOMATIC" | "MANUAL";

interface VerificationPolicy {
  profileEdit: VerificationMode;
  newPaper: VerificationMode;
  newDataset: VerificationMode;
  newProject: VerificationMode;
  updateProject: VerificationMode;
  archiveProject: VerificationMode;
}

interface RankPolicy {
  seniorPaperMinimum: number;
  seniorCitationMinimum: number;
  leadPaperMinimum: number;
  leadCitationMinimum: number;
}

interface NotificationPolicy {
  applicationAccepted: boolean;
  applicationRejected: boolean;
  taskAssigned: boolean;
  taskChanged: boolean;
  milestoneProgress: boolean;
  deadlineReminder: boolean;
  deadlineDue: boolean;
  deadlineOverdue: boolean;
  reminderDays: number;
}

const NOTIFICATION_LABELS: Record<
  Exclude<keyof NotificationPolicy, "reminderDays">,
  [string, string]
> = {
  applicationAccepted: [
    "Accepted applications",
    "Email the PDF appointment letter.",
  ],
  applicationRejected: [
    "Rejected applications",
    "Email the applicant when a decision is recorded.",
  ],
  taskAssigned: ["Task assignments", "Notify the person assigned to a task."],
  taskChanged: [
    "Task changes",
    "Notify owners when task details or status change.",
  ],
  milestoneProgress: [
    "Milestone progress",
    "Notify project members when milestone progress changes.",
  ],
  deadlineReminder: [
    "Deadline reminders",
    "Send a reminder before a task or milestone is due.",
  ],
  deadlineDue: ["Due today", "Notify owners on the due date."],
  deadlineOverdue: ["Overdue", "Notify owners once after a deadline passes."],
};

const LABELS: Record<keyof VerificationPolicy, [string, string]> = {
  profileEdit: [
    "Profile changes",
    "Updates to names, biography, links, and public profile data.",
  ],
  newPaper: [
    "New papers",
    "First publication of a paper record and contributor evidence.",
  ],
  newDataset: ["New datasets", "First publication of a dataset record."],
  newProject: [
    "New projects",
    "Creation and first publication of a project workspace.",
  ],
  updateProject: [
    "Project changes",
    "Project details, milestones, updates, people, outputs, and resources.",
  ],
  archiveProject: [
    "Project archiving",
    "Move a project out of active listings while retaining its record.",
  ],
};

export function AdminSettings() {
  const { showToast } = useNotifications();
  const [verification, setVerification] = useState<VerificationPolicy | null>(
    null,
  );
  const [ranking, setRanking] = useState<RankPolicy | null>(null);
  const [notificationPolicy, setNotificationPolicy] =
    useState<NotificationPolicy | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    Promise.all([
      apiRequest<VerificationPolicy>("/settings/verification", {
        method: "GET",
      }),
      apiRequest<RankPolicy>("/settings/ranking", { method: "GET" }),
      apiRequest<NotificationPolicy>("/settings/notifications", {
        method: "GET",
      }),
    ])
      .then(([nextVerification, nextRanking, nextNotificationPolicy]) => {
        setVerification(nextVerification);
        setRanking(nextRanking);
        setNotificationPolicy(nextNotificationPolicy);
      })
      .catch((value: Error) => setError(value.message))
      .finally(() => setLoading(false));
  }, [reload]);

  async function save() {
    if (!verification || !ranking || !notificationPolicy) return;
    setError("");
    setMessage("");
    setSaving(true);
    try {
      const results = await Promise.allSettled([
        apiRequest("/settings/verification", {
          body: JSON.stringify(verification),
          headers: { "content-type": "application/json" },
          method: "PUT",
        }),
        apiRequest("/settings/ranking", {
          body: JSON.stringify(ranking),
          headers: { "content-type": "application/json" },
          method: "PUT",
        }),
        apiRequest("/settings/notifications", {
          body: JSON.stringify(notificationPolicy),
          headers: { "content-type": "application/json" },
          method: "PUT",
        }),
      ]);
      const savedCount = results.filter(
        (result) => result.status === "fulfilled",
      ).length;
      if (savedCount !== results.length) {
        if (!savedCount) {
          const failed = results.find((result) => result.status === "rejected");
          throw failed?.status === "rejected"
            ? failed.reason
            : new Error("Unable to save settings");
        }
        setVerification(null);
        setRanking(null);
        setNotificationPolicy(null);
        setLoading(true);
        setReload((value) => value + 1);
        const message =
          "Some settings were saved and others failed. The saved values are reloading.";
        setError(message);
        showToast({
          body: message,
          title: "Settings were only partly saved",
          tone: "error",
        });
        return;
      }
      setMessage("Settings saved. Rank recalculation is queued.");
      showToast({
        body: "Settings saved. Rank recalculation is queued.",
        title: "Settings saved",
      });
    } catch (value) {
      const message =
        value instanceof Error ? value.message : "Unable to save settings";
      setError(message);
      showToast({
        body: message,
        title: "Settings were not saved",
        tone: "error",
      });
    } finally {
      setSaving(false);
    }
  }

  function updateVerification(key: keyof VerificationPolicy, mode: string) {
    if (!verification) return;
    setVerification({ ...verification, [key]: mode as VerificationMode });
  }

  const displayedVerification: VerificationPolicy = verification ?? {
    profileEdit: "AUTOMATIC",
    newPaper: "AUTOMATIC",
    newDataset: "AUTOMATIC",
    newProject: "AUTOMATIC",
    updateProject: "AUTOMATIC",
    archiveProject: "MANUAL",
  };
  const displayedRanking: RankPolicy = ranking ?? {
    seniorPaperMinimum: 0,
    seniorCitationMinimum: 0,
    leadPaperMinimum: 0,
    leadCitationMinimum: 0,
  };
  const displayedNotificationPolicy = notificationPolicy ?? {
    applicationAccepted: true,
    applicationRejected: true,
    taskAssigned: true,
    taskChanged: true,
    milestoneProgress: true,
    deadlineReminder: true,
    deadlineDue: true,
    deadlineOverdue: true,
    reminderDays: 3,
  };
  const loadFailed = Boolean(
    error && (!verification || !ranking || !notificationPolicy) && !loading,
  );

  return (
    <AdminOnly>
      <div
        className="grid w-full gap-8"
        data-loading={loading || undefined}
      >
        {message ? (
          <p className="m-0 border-l-[3px] border-success bg-success-soft px-4 py-[.8rem] text-[.78rem]">
            {message}
          </p>
        ) : null}
        {error && verification && ranking && notificationPolicy ? (
          <p className="m-0 border-l-[3px] border-danger bg-danger-soft px-4 py-[.8rem] text-[.78rem]">
            {error}
          </p>
        ) : null}

        {loadFailed ? (
          <StatePanel
            action={{
              label: "Retry",
              onClick: () => {
                setLoading(true);
                setReload((value) => value + 1);
              },
            }}
            body="The policy record could not be retrieved."
            title="Could not load policies"
            variant="error"
          />
        ) : (
          <>
            <section className="frame-rail-section grid gap-[1.1rem] py-5">
              <header className="grid grid-cols-[42px_minmax(0,1fr)] items-start gap-[1.2rem] border-b border-line pb-4 max-[640px]:grid-cols-1">
                <span className="pt-[.35rem] font-mono text-[.62rem] text-ink-faint">
                  01
                </span>
                <div>
                  <p className="m-0 mb-4 font-[var(--font-sans)] text-[.75rem] font-extrabold uppercase tracking-[.12em] text-brand">
                    Review gates
                  </p>
                  <h2 className="mt-[.35rem] font-sans text-[clamp(1.75rem,3vw,2.6rem)] font-normal leading-none">
                    Content verification
                  </h2>
                  <p className="mt-[.7rem] max-w-[680px] text-[.78rem] leading-[1.55] text-ink-muted">
                    Route sensitive changes through the moderator queue while
                    allowing low-risk updates to publish immediately.
                  </p>
                </div>
              </header>

              <div className="ml-[calc(42px+1.2rem)] grid overflow-hidden border-y border-line-strong bg-transparent max-[640px]:ml-0">
                {(Object.keys(LABELS) as Array<keyof VerificationPolicy>).map(
                  (key) => {
                    const manual = displayedVerification[key] === "MANUAL";
                    return (
                      <article
                        className="grid min-h-[76px] grid-cols-[minmax(240px,1fr)_minmax(130px,.45fr)_226px] items-center gap-4 border-b border-line px-4 py-[.95rem] last:border-b-0 max-[900px]:grid-cols-1 max-[900px]:items-start"
                        key={key}
                      >
                        <div>
                          <strong className="text-[.86rem]">
                            {LABELS[key][0]}
                          </strong>
                          <p className="mt-1 text-[.72rem] leading-[1.5] text-ink-muted">
                            {LABELS[key][1]}
                          </p>
                        </div>
                        <span
                          className={cn(
                            "font-mono text-[.72rem] uppercase text-ink-muted",
                            loadingPlaceholder(loading, "label", "medium"),
                          )}
                          data-placeholder={loading ? "label" : undefined}
                          data-placeholder-width="medium"
                        >
                          {manual ? "Moderator queue" : "Publishes directly"}
                        </span>
                        <SegmentedControl
                          ariaLabel={`${LABELS[key][0]} verification mode`}
                          disabled={loading}
                          loading={loading}
                          onValueChange={(mode) =>
                            updateVerification(key, mode)
                          }
                          options={[
                            { label: "Automatic", value: "AUTOMATIC" },
                            { label: "Manual review", value: "MANUAL" },
                          ]}
                          value={manual ? "MANUAL" : "AUTOMATIC"}
                        />
                      </article>
                    );
                  },
                )}
              </div>
            </section>

            <section className="frame-rail-section grid gap-[1.1rem] py-5">
              <header className="grid grid-cols-[42px_minmax(0,1fr)] items-start gap-[1.2rem] border-b border-line pb-4 max-[640px]:grid-cols-1">
                <span className="pt-[.35rem] font-mono text-[.62rem] text-ink-faint">
                  02
                </span>
                <div>
                  <p className="m-0 mb-4 font-[var(--font-sans)] text-[.75rem] font-extrabold uppercase tracking-[.12em] text-brand">
                    Public ordering
                  </p>
                  <h2 className="mt-[.35rem] font-sans text-[clamp(1.75rem,3vw,2.6rem)] font-normal leading-none">
                    Research rank thresholds
                  </h2>
                  <p className="mt-[.7rem] max-w-[680px] text-[.78rem] leading-[1.55] text-ink-muted">
                    Control when publication activity can lift a public profile
                    above its appointed account rank.
                  </p>
                </div>
              </header>

              <div className="ml-[calc(42px+1.2rem)] grid gap-4 border-y border-line-strong bg-transparent p-4 max-[640px]:ml-0">
                <div className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-[.8rem] rounded-panel bg-brand-faint p-4">
                  <ShieldCheck className="text-brand" size={22} />
                  <div>
                    <strong>Earned and appointed ranks stay separate.</strong>
                    <p className="mt-[.3rem] text-[.72rem] leading-[1.5] text-ink-muted">
                      Public profiles use the higher of the appointed rank and
                      the publication-earned rank. Without a Scholar link, only
                      the paper threshold is required.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1">
                  <strong className="border-t border-line pb-[.2rem] pt-4 text-[.9rem]">
                    Senior researcher
                  </strong>
                  <label className="grid grid-cols-[minmax(0,1fr)_160px] items-center gap-4 border-t border-line py-[.7rem] text-[.8rem] font-semibold text-ink-muted max-[640px]:grid-cols-1">
                    Published papers
                    <InputControl
                      className={loadingPlaceholder(loading, "control")}
                      data-placeholder={loading ? "control" : undefined}
                      disabled={loading}
                      min="0"
                      onChange={(event) =>
                        ranking &&
                        setRanking({
                          ...ranking,
                          seniorPaperMinimum: Number(event.target.value),
                        })
                      }
                      type="number"
                      value={displayedRanking.seniorPaperMinimum}
                    />
                  </label>
                  <label className="grid grid-cols-[minmax(0,1fr)_160px] items-center gap-4 border-t border-line py-[.7rem] text-[.8rem] font-semibold text-ink-muted max-[640px]:grid-cols-1">
                    Scholar citations
                    <InputControl
                      className={loadingPlaceholder(loading, "control")}
                      data-placeholder={loading ? "control" : undefined}
                      disabled={loading}
                      min="0"
                      onChange={(event) =>
                        ranking &&
                        setRanking({
                          ...ranking,
                          seniorCitationMinimum: Number(event.target.value),
                        })
                      }
                      type="number"
                      value={displayedRanking.seniorCitationMinimum}
                    />
                  </label>

                  <strong className="border-t border-line pb-[.2rem] pt-4 text-[.9rem]">
                    Lead researcher
                  </strong>
                  <label className="grid grid-cols-[minmax(0,1fr)_160px] items-center gap-4 border-t border-line py-[.7rem] text-[.8rem] font-semibold text-ink-muted max-[640px]:grid-cols-1">
                    Published papers
                    <InputControl
                      className={loadingPlaceholder(loading, "control")}
                      data-placeholder={loading ? "control" : undefined}
                      disabled={loading}
                      min="0"
                      onChange={(event) =>
                        ranking &&
                        setRanking({
                          ...ranking,
                          leadPaperMinimum: Number(event.target.value),
                        })
                      }
                      type="number"
                      value={displayedRanking.leadPaperMinimum}
                    />
                  </label>
                  <label className="grid grid-cols-[minmax(0,1fr)_160px] items-center gap-4 border-t border-line py-[.7rem] text-[.8rem] font-semibold text-ink-muted max-[640px]:grid-cols-1">
                    Scholar citations
                    <InputControl
                      className={loadingPlaceholder(loading, "control")}
                      data-placeholder={loading ? "control" : undefined}
                      disabled={loading}
                      min="0"
                      onChange={(event) =>
                        ranking &&
                        setRanking({
                          ...ranking,
                          leadCitationMinimum: Number(event.target.value),
                        })
                      }
                      type="number"
                      value={displayedRanking.leadCitationMinimum}
                    />
                  </label>
                </div>
              </div>
            </section>

            <section className="frame-rail-section grid gap-[1.1rem] py-5">
              <header className="grid grid-cols-[42px_minmax(0,1fr)] items-start gap-[1.2rem] border-b border-line pb-4 max-[640px]:grid-cols-1">
                <span className="pt-[.35rem] font-mono text-[.62rem] text-ink-faint">
                  03
                </span>
                <div>
                  <p className="m-0 mb-4 font-[var(--font-sans)] text-[.75rem] font-extrabold uppercase tracking-[.12em] text-brand">
                    Delivery rules
                  </p>
                  <h2 className="mt-[.35rem] font-sans text-[clamp(1.75rem,3vw,2.6rem)] font-normal leading-none">
                    Email and notifications
                  </h2>
                  <p className="mt-[.7rem] max-w-[760px] text-[.78rem] leading-[1.55] text-ink-muted">
                    Each workflow can be enabled independently. Deadline notices
                    are deduplicated, so a person receives each event once.
                  </p>
                </div>
              </header>
              <div className="ml-[calc(42px+1.2rem)] grid overflow-hidden border-y border-line-strong bg-transparent max-[640px]:ml-0">
                {(
                  Object.keys(NOTIFICATION_LABELS) as Array<
                    Exclude<keyof NotificationPolicy, "reminderDays">
                  >
                ).map((key) => (
                  <article
                    className="grid min-h-[76px] grid-cols-[minmax(240px,1fr)_180px] items-center gap-4 border-b border-line px-4 py-[.95rem] last:border-b-0 max-[700px]:grid-cols-1"
                    key={key}
                  >
                    <div>
                      <strong className="text-[.86rem]">
                        {NOTIFICATION_LABELS[key][0]}
                      </strong>
                      <p className="mt-1 text-[.72rem] leading-[1.5] text-ink-muted">
                        {NOTIFICATION_LABELS[key][1]}
                      </p>
                    </div>
                    <SegmentedControl
                      ariaLabel={`${NOTIFICATION_LABELS[key][0]} delivery`}
                      disabled={loading}
                      loading={loading}
                      onValueChange={(value) =>
                        notificationPolicy &&
                        setNotificationPolicy({
                          ...notificationPolicy,
                          [key]: value === "ON",
                        })
                      }
                      options={[
                        { label: "On", value: "ON" },
                        { label: "Off", value: "OFF", tone: "neutral" },
                      ]}
                      value={displayedNotificationPolicy[key] ? "ON" : "OFF"}
                    />
                  </article>
                ))}
                <label className="grid grid-cols-[minmax(240px,1fr)_160px] items-center gap-4 border-t border-line px-4 py-[.95rem] text-[.8rem] font-semibold text-ink-muted max-[700px]:grid-cols-1">
                  <span>
                    Reminder lead time
                    <small className="mt-1 block font-normal leading-[1.5]">
                      Calendar days before the due date.
                    </small>
                  </span>
                  <InputControl
                    disabled={loading}
                    max="30"
                    min="0"
                    onChange={(event) =>
                      notificationPolicy &&
                      setNotificationPolicy({
                        ...notificationPolicy,
                        reminderDays: Number(event.target.value),
                      })
                    }
                    type="number"
                    value={displayedNotificationPolicy.reminderDays}
                  />
                </label>
              </div>
            </section>

            <footer className="frame-rail-section flex items-center justify-between gap-4 py-5 max-[640px]:flex-col max-[640px]:items-stretch">
              <p className="m-0 text-[.72rem] leading-[1.5] text-ink-muted">
                Scholar profiles sync daily with gradual scheduling, backoff,
                and last-known citation totals.
              </p>
              <ButtonControl
                className={loadingPlaceholder(loading, "control")}
                data-placeholder={loading ? "control" : undefined}
                disabled={loading || saving}
                loading={loading || saving}
                onClick={save}
                type="button"
              >
                <Save size={15} />
                Save policy
              </ButtonControl>
            </footer>
          </>
        )}
      </div>
    </AdminOnly>
  );
}
