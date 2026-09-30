import { CircleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import type { ReviewIssue, ReviewIssueTone } from "@/lib/review-issues";
import { loadingPlaceholder } from "@/lib/loading-style";

const toneClasses: Record<ReviewIssueTone, string> = {
  error: "bg-danger-soft text-danger",
  warning: "bg-warning-soft text-warning",
  pending: "bg-warning-soft text-warning",
  success: "bg-success-soft text-success",
  info: "bg-info-soft text-info",
  neutral: "bg-surface-subtle text-ink-muted",
};

export function SemanticStatus({
  children,
  className,
  tone = "neutral",
  loading = false,
}: {
  children: ReactNode;
  className?: string;
  tone?: ReviewIssueTone;
  loading?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex w-fit items-center rounded-small px-[.42rem] py-[.18rem] text-[.7rem] font-medium leading-[1.35]",
        toneClasses[tone],
        loading && loadingPlaceholder(true, "label", "long"),
        className,
      )}
      data-loading={loading || undefined}
      data-placeholder={loading ? "label" : undefined}
    >
      {children}
    </span>
  );
}

export function ReviewIssueStamp({
  issue,
  className,
}: {
  issue?: ReviewIssue;
  className?: string;
}) {
  if (!issue) return null;
  const tone = issue.tone ?? "error";
  return (
    <span
      aria-label={issue.message}
      className={cn(
        "absolute top-2 right-2 z-[2] grid h-7 w-7 place-items-center rounded-control border border-current/20",
        toneClasses[tone],
        className,
      )}
      title={issue.message}
    >
      <CircleAlert aria-hidden="true" size={15} strokeWidth={2.2} />
    </span>
  );
}
