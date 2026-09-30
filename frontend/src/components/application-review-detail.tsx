"use client";

import { cn } from "@/lib/cn";
import { loadingPlaceholder } from "@/lib/loading-style";
import { ExternalLink, FileText } from "lucide-react";
import { useEffect, useState } from "react";
import { ReviewActions } from "./review-actions";
import { StatePanel } from "./state-panel";
import { useAuth } from "./auth-provider";
import { API_URL } from "@/lib/api";
import { ApiRequestError, apiRequest } from "@/lib/client-api";
import { Badge, type BadgeTone } from "./ui/badge";
import { useNotifications } from "./notification-provider";
import { ButtonAnchor } from "@/components/ui/button-control";
import { useReviewIssues } from "@/lib/use-review-issues";
import {
  ReviewIssueStamp,
  SemanticStatus,
} from "@/components/ui/semantic-status";

interface ReviewApplication {
  id: string;
  fullName: string;
  email: string;
  phone: string | null;
  educationSummary: string | null;
  relevantLinks: string[];
  status: string;
  extractedText: string | null;
  parsedResume: unknown;
  parseFeedback: string | null;
  position: { title: string };
  createdAt: string;
  decisionReason: string | null;
  appointmentLetter: {
    ready: boolean;
    checksum: string | null;
    emailSentAt: string | null;
    lastEmailError: string | null;
  } | null;
}
type Decision = "ACCEPTED" | "REJECTED";

function ParsedResume({
  value,
  loading = false,
}: {
  value: unknown;
  loading?: boolean;
}) {
  const resume =
    !loading && value && typeof value === "object" && !Array.isArray(value)
      ? (value as {
          profile?: Record<string, unknown>;
          sections?: Record<string, unknown>;
          pageCount?: unknown;
          textLength?: unknown;
        })
      : undefined;
  const profileEntries = loading
    ? ([
        ["Field", "Loading extracted value"],
        ["Field", "Loading extracted value"],
        ["Field", "Loading extracted value"],
      ] as Array<[string, unknown]>)
    : Object.entries(resume?.profile ?? {});

  if (!loading && !resume)
    return (
      <p className="m-0 text-[.82rem] leading-[1.5] text-ink-muted">
        No structured browser extraction is available.
      </p>
    );

  return (
    <div
      className="mt-4 grid border-t border-line"
      data-loading={loading || undefined}
    >
      {profileEntries.map(([key, item], index) => (
        <div
          className="grid grid-cols-[120px_minmax(0,1fr)] gap-[.35rem] py-3"
          key={`${key}-${index}`}
        >
          <span
            className={cn(
              "text-[.72rem] capitalize text-ink-muted",
              loadingPlaceholder(loading, "label"),
            )}
            data-placeholder={loading ? "label" : undefined}
          >
            {key}
          </span>
          <strong
            className={cn(
              "text-[.82rem] [overflow-wrap:anywhere]",
              loadingPlaceholder(loading, "text", "long"),
            )}
            data-placeholder={loading ? "text" : undefined}
            data-placeholder-width="long"
          >
            {String(item ?? "Not detected")}
          </strong>
        </div>
      ))}
      {!loading && resume?.pageCount ? (
        <div className="grid grid-cols-[120px_minmax(0,1fr)] gap-[.35rem] py-3">
          <span className="text-[.72rem] capitalize text-ink-muted">Pages</span>
          <strong className="text-[.82rem] [overflow-wrap:anywhere]">
            {String(resume.pageCount)}
          </strong>
        </div>
      ) : null}
      {!loading && resume?.sections
        ? Object.entries(resume.sections)
            .filter(([, lines]) => Array.isArray(lines) && lines.length)
            .map(([name, lines]) => (
              <section className="border-t border-line py-4" key={name}>
                <h3 className="font-sans text-base capitalize">{name}</h3>
                <ul className="mt-[.7rem] grid gap-[.45rem] pl-[1.2rem] text-[.8rem] leading-[1.5] text-ink-muted">
                  {(lines as unknown[]).map((line, index) => (
                    <li key={index}>{String(line)}</li>
                  ))}
                </ul>
              </section>
            ))
        : null}
    </div>
  );
}

/**
 * The open application inside the review split. `id` is undefined while the
 * queue's first load is pending (renders the loading structure).
 */
export function ApplicationReviewDetail({
  id,
  onDecided,
}: {
  id: string | undefined;
  onDecided: () => void;
}) {
  const { user } = useAuth();
  const { refreshUnreadCount } = useNotifications();
  const [application, setApplication] = useState<ReviewApplication>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [reload, setReload] = useState(0);
  const reviewIssues = useReviewIssues();

  useEffect(() => {
    if (!id) return;
    let active = true;
    void apiRequest<ReviewApplication>(`/applications/${id}`, { method: "GET" })
      .then((item) => {
        if (active) {
          setApplication(item);
          setError(undefined);
        }
      })
      .catch((caught: unknown) => {
        if (active)
          setError(
            caught instanceof Error
              ? caught.message
              : "Unable to load application.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [id, reload]);

  async function decide({ note, status }: { note?: string; status: Decision }) {
    if (!application) return;
    setError(undefined);
    await apiRequest(`/applications/${application.id}/review`, {
      body: JSON.stringify({ ...(note ? { reason: note } : {}), status }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    void refreshUnreadCount().catch(() => undefined);
    onDecided();
  }

  if (!loading && !application)
    return (
      <StatePanel
        action={{
          label: "Retry",
          onClick: () => {
            setLoading(true);
            setReload((value) => value + 1);
          },
        }}
        body="The review record could not be retrieved."
        title={error ?? "Application not found"}
        variant="error"
      />
    );
  const canDecide =
    !loading &&
    user?.role === "ADMIN" &&
    application?.status === "NEEDS_REVIEW";
  const status = application?.status ?? "NEEDS_REVIEW";
  const relevantLinks = loading
    ? [undefined]
    : (application?.relevantLinks ?? []);

  return (
    <div className="grid min-w-0 gap-5" data-loading={loading || undefined}>
      <header className="relative flex items-start justify-between gap-8 border-b border-line pb-5 @max-[520px]:flex-col">
        {application ? (
          <ReviewIssueStamp issue={reviewIssues.forItem(application.id)[0]} />
        ) : null}
        <div>
          <p className="m-0 mb-4 font-[var(--font-sans)] text-[.75rem] font-extrabold uppercase tracking-[.12em] text-brand">
            Applicant review
          </p>
          <h2
            className={cn(
              "font-sans text-[clamp(1.7rem,2.8vw,2.4rem)] leading-[1.1]",
              loadingPlaceholder(loading, "text", "long"),
            )}
            data-placeholder="text"
            data-placeholder-width="long"
          >
            {application?.fullName ?? "Loading applicant"}
          </h2>
          <p
            className={cn(
              "mt-[.7rem] text-[.8rem] text-ink-muted",
              loadingPlaceholder(loading, "text", "long"),
            )}
            data-placeholder="text"
            data-placeholder-width="long"
          >
            {application
              ? `${application.position.title} · submitted ${new Date(application.createdAt).toLocaleDateString()}`
              : "Loading position and submission date"}
          </p>
        </div>
        <Badge
          dot
          live={!loading && status === "NEEDS_REVIEW"}
          loading={loading}
          tone={application ? applicationDetailTone(status) : "neutral"}
        >
          {status.replaceAll("_", " ").toLowerCase()}
        </Badge>
      </header>
      <div className="grid grid-cols-[minmax(0,1.35fr)_minmax(240px,.65fr)] items-start border-b border-line @max-[640px]:grid-cols-1">
        <section className="min-w-0 py-5 pr-5 @max-[640px]:pr-0">
          <h2 className="mb-5 font-sans text-[1.3rem]">Parsed information</h2>
          <dl className="m-0 grid gap-0">
            <div className="grid grid-cols-[120px_minmax(0,1fr)] gap-4 border-t border-line py-[.8rem]">
              <dt className="text-[.78rem] font-[750] text-ink-muted">Email</dt>
              <dd
                className={cn(
                  "m-0",
                  loadingPlaceholder(loading, "text", "long"),
                )}
                data-placeholder="text"
                data-placeholder-width="long"
              >
                {application?.email ?? "loading@example.org"}
              </dd>
            </div>
            <div className="grid grid-cols-[120px_minmax(0,1fr)] gap-4 border-t border-line py-[.8rem]">
              <dt className="text-[.78rem] font-[750] text-ink-muted">Phone</dt>
              <dd
                className={cn(
                  "m-0",
                  loadingPlaceholder(loading, "text", "medium"),
                )}
                data-placeholder="text"
                data-placeholder-width="medium"
              >
                {application?.phone ??
                  (loading ? "Loading phone" : "Not provided")}
              </dd>
            </div>
            <div className="grid grid-cols-[120px_minmax(0,1fr)] gap-4 border-t border-line py-[.8rem]">
              <dt className="text-[.78rem] font-[750] text-ink-muted">
                Education
              </dt>
              <dd
                className={cn(
                  "m-0",
                  loadingPlaceholder(loading, "text", "full"),
                )}
                data-placeholder="text"
                data-placeholder-width="full"
              >
                {application?.educationSummary ??
                  (loading ? "Loading education" : "Not provided")}
              </dd>
            </div>
          </dl>
          <ParsedResume loading={loading} value={application?.parsedResume} />
          {relevantLinks.length ? (
            <div className="grid gap-2 border-t border-line pt-4">
              <h3 className="font-sans text-base">Relevant links</h3>
              {relevantLinks.map((link, index) =>
                loading ? (
                  <span
                    aria-hidden="true"
                    className={loadingPlaceholder(true, "text", "long")}
                    key={`link-loading-${index}`}
                  >
                    Loading relevant link
                  </span>
                ) : (
                  <a
                    className="flex items-center gap-[.4rem] text-[.75rem] text-brand [overflow-wrap:anywhere]"
                    href={link}
                    key={link}
                    rel="noreferrer"
                    target="_blank"
                  >
                    {link}
                    <ExternalLink aria-hidden="true" size={14} />
                  </a>
                ),
              )}
            </div>
          ) : null}
        </section>
        <aside className="min-w-0 border-l border-line py-5 pl-5 @max-[640px]:border-t @max-[640px]:border-l-0 @max-[640px]:pl-0">
          <h2 className="mb-5 font-sans text-[1.3rem]">Original file</h2>
          <div className="flex flex-col items-center border-y border-line-strong bg-canvas px-4 py-8 text-center">
            <FileText
              aria-hidden="true"
              className="mb-[.6rem] text-brand"
              size={34}
            />
            <strong>Applicant CV</strong>
            <span className="mb-4 mt-[.3rem] text-[.7rem] text-ink-muted">
              PDF · private reviewer access
            </span>
            <ButtonAnchor
              href={
                application
                  ? `${API_URL}/applications/${application.id}/cv`
                  : "#"
              }
              loading={loading || !application}
              rel="noreferrer"
              target={loading ? undefined : "_blank"}
              variant="secondary"
            >
              Open original
            </ButtonAnchor>
          </div>
          <div className="mt-4 grid gap-2 border-y border-line-strong bg-canvas p-4">
            <span className="font-mono text-[.64rem] uppercase tracking-[.06em] text-ink-muted">
              ATS assessment
            </span>
            {loading ? (
              <p
                className={cn(
                  "m-0 text-[.8rem] leading-[1.55] text-ink-muted",
                  loadingPlaceholder(true, "text", "full"),
                )}
                data-placeholder="text"
                data-placeholder-width="full"
              >
                Loading ATS assessment
              </p>
            ) : application?.status === "PARSE_FAILED" ? (
              <SemanticStatus loading={loading} tone="error">
                The uploaded PDF could not be processed automatically.
              </SemanticStatus>
            ) : application?.status === "PARSING" ? (
              <SemanticStatus loading={loading} tone="pending">
                Automatic CV processing is still running.
              </SemanticStatus>
            ) : (
              <>
                <SemanticStatus loading={loading} tone="success">
                  Automatic CV processing completed.
                </SemanticStatus>
                {application?.parseFeedback ? (
                  <p className="m-0 text-[.8rem] leading-[1.55] text-ink-muted">
                    {application.parseFeedback}
                  </p>
                ) : null}
              </>
            )}
          </div>
          <details className="mt-4 border-t border-line pt-4">
            <summary className="cursor-pointer text-[.8rem] font-bold">
              Backend extraction
            </summary>
            <pre
              className={cn(
                "max-h-[300px] overflow-auto whitespace-pre-wrap rounded-panel bg-canvas p-[.8rem] font-mono text-[.65rem] leading-[1.5]",
                loadingPlaceholder(loading, "text"),
              )}
              data-placeholder={loading ? "text" : undefined}
            >
              {application?.extractedText ??
                (loading ? "Loading extracted text" : "No extracted text.")}
            </pre>
          </details>
          {application?.appointmentLetter ? (
            <div className="mt-4 grid gap-3 border-t border-line pt-4">
              <span className="font-mono text-[.64rem] uppercase tracking-[.06em] text-brand">
                Appointment letter
              </span>
              <SemanticStatus
                tone={
                  application.appointmentLetter.lastEmailError
                    ? "error"
                    : application.appointmentLetter.emailSentAt
                      ? "success"
                      : "pending"
                }
              >
                {application.appointmentLetter.lastEmailError
                  ? "Delivery will be retried."
                  : application.appointmentLetter.emailSentAt
                    ? "PDF emailed to the applicant."
                    : "PDF generation and email are queued."}
              </SemanticStatus>
              {application.appointmentLetter.ready ? (
                <ButtonAnchor
                  href={`${API_URL}/applications/${application.id}/appointment-letter`}
                  rel="noreferrer"
                  target="_blank"
                  variant="secondary"
                >
                  Open appointment letter
                </ButtonAnchor>
              ) : null}
            </div>
          ) : null}
        </aside>
      </div>
      {loading || canDecide ? (
        <div className="sticky bottom-0 z-[5] grid gap-4 border-t border-line bg-[color-mix(in_srgb,var(--surface)_94%,transparent)] py-4 backdrop-blur-[12px]">
          <ReviewActions
            loading={loading}
            actions={[
              {
                confirmDescription: application
                  ? `Reject ${application.fullName} and email the reviewer feedback. This cannot be reviewed again.`
                  : "Reject this application with reviewer feedback.",
                confirmLabel: "Reject application",
                confirmTitle: "Reject this application?",
                label: "Reject",
                notePlaceholder:
                  "Give useful feedback when rejecting an application.",
                requiresNote: true,
                status: "REJECTED" as Decision,
                tone: "danger",
              },
              {
                confirmDescription: application
                  ? `Accept ${application.fullName}, create the account record, and queue their PDF appointment letter for email delivery.`
                  : "Accept this application, create its account record, and queue the appointment letter.",
                confirmLabel: "Accept and create account",
                confirmTitle: "Accept this application?",
                label: "Accept and create account",
                status: "ACCEPTED" as Decision,
                tone: "primary",
              },
            ]}
            onError={(requestError) => {
              if (!application) return;
              if (
                requestError instanceof ApiRequestError &&
                requestError.issues.length
              )
                reviewIssues.capture(requestError);
              else
                reviewIssues.setOne(application.id, {
                  code: "APPLICATION_REVIEW_FAILED",
                  message: "This application decision could not be saved.",
                  tone: "error",
                });
            }}
            onSubmit={application ? decide : () => Promise.resolve()}
            onSuccess={() =>
              application && reviewIssues.clearOne(application.id)
            }
            successBody={(decisionStatus) =>
              application
                ? `${application.fullName}'s application was ${decisionStatus.toLowerCase()}.`
                : "Application decision saved."
            }
            successTitle="Application decision saved"
          />
        </div>
      ) : user?.role !== "ADMIN" && application?.status === "NEEDS_REVIEW" ? (
        <StatePanel
          body="Moderators may inspect applications, but only an administrator can make the final decision."
          title="Administrator decision required"
          variant="permission"
        />
      ) : application?.decisionReason ? (
        <div className="mt-4 border border-info/30 border-l-[3px] border-l-info bg-info-soft p-4">
          <span className="font-mono text-[.64rem] uppercase tracking-[.06em] text-info">
            Decision note
          </span>
          <p className="mt-[.45rem] text-[.8rem] leading-[1.55] text-ink-muted">
            {application.decisionReason}
          </p>
        </div>
      ) : null}
    </div>
  );
}

function applicationDetailTone(status: string): BadgeTone {
  if (status === "NEEDS_REVIEW") return "warning";
  if (status === "ACCEPTED") return "success";
  if (status === "PARSING") return "warning";
  return "error";
}
