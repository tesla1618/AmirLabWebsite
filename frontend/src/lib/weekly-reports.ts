export type WeeklyReportStatus =
  "CHANGES_REQUESTED" | "DRAFT" | "REVIEWED" | "SUBMITTED";

export interface WeeklyReport {
  id: string;
  weekStart: string;
  accomplishments: string;
  blockers: string | null;
  nextWeekPlan: string;
  status: WeeklyReportStatus;
  reviewNote: string | null;
  submittedAt: string | null;
  reviewedAt: string | null;
  authorId: string;
  author: {
    email: string | null;
    person: { fullName: string } | null;
  };
  reviewedBy: {
    email: string | null;
    person: { fullName: string } | null;
  } | null;
  projects: Array<{
    projectId: string;
    project: { researchItem: { title: string | null } };
  }>;
  outputs: Array<{
    outputId: string;
    output: { title: string | null; type: "DATASET" | "PAPER" };
  }>;
}

export interface WeeklyReportContext {
  weekStart: string;
  report: WeeklyReport | null;
  projects: Array<{
    id: string;
    title: string;
    tasks: { completed: number; due: number; open: number };
  }>;
  outputs: Array<{
    id: string;
    title: string;
    type: "DATASET" | "PAPER";
  }>;
}

export function reportStatusLabel(status: WeeklyReportStatus): string {
  return status
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/^./, (letter) => letter.toUpperCase());
}

export function reportWeek(value: string): string {
  const start = new Date(value);
  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 6);
  const format = new Intl.DateTimeFormat("en", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
  return `${format.format(start)} - ${format.format(end)}`;
}
