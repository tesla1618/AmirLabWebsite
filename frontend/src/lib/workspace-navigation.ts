import {
  Bell,
  BookOpenText,
  BriefcaseBusiness,
  Building2,
  CheckSquare2,
  ClipboardCheck,
  FilePenLine,
  FileText,
  FolderKanban,
  LayoutDashboard,
  NotebookPen,
  Network,
  Settings,
  University,
  UserRound,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { AuthenticatedUser } from "@/lib/types";

export type WorkspaceIndicator =
  | "applications"
  | "notifications"
  | "profileReviews"
  | "projectReviews"
  | "researchReviews"
  | "weeklyReportReviews";

export interface WorkspaceNavigationItem {
  href: string;
  icon: LucideIcon;
  indicator?: WorkspaceIndicator;
  label: string;
  match?: "exact";
}

export interface WorkspaceNavigationGroup {
  label: string;
  items: readonly WorkspaceNavigationItem[];
}

const MEMBER_WORK: readonly WorkspaceNavigationItem[] = [
  { href: "/workspace", icon: LayoutDashboard, label: "Lab overview" },
  { href: "/workspace/tasks", icon: CheckSquare2, label: "My tasks" },
  {
    href: "/workspace/weekly-reports",
    icon: NotebookPen,
    label: "Weekly reports",
    match: "exact",
  },
  {
    href: "/workspace/notifications",
    icon: Bell,
    indicator: "notifications",
    label: "Notifications",
  },
  { href: "/workspace/profile", icon: UserRound, label: "My profile" },
  {
    href: "/workspace/settings/account",
    icon: Settings,
    label: "Account & devices",
  },
];

const STAFF_WORK: readonly WorkspaceNavigationItem[] = [
  { href: "/workspace", icon: LayoutDashboard, label: "Lab overview" },
  {
    href: "/workspace/notifications",
    icon: Bell,
    indicator: "notifications",
    label: "Notifications",
  },
  { href: "/workspace/profile", icon: UserRound, label: "Profile" },
  {
    href: "/workspace/settings/account",
    icon: Settings,
    label: "Account & devices",
  },
];

const RESEARCH: readonly WorkspaceNavigationItem[] = [
  { href: "/workspace/programs", icon: Network, label: "Research programs" },
  { href: "/workspace/projects", icon: FolderKanban, label: "Projects" },
  {
    href: "/workspace/submissions",
    icon: BookOpenText,
    label: "Papers & datasets",
  },
];

const REVIEW: readonly WorkspaceNavigationItem[] = [
  {
    href: "/workspace/profile-reviews",
    icon: ClipboardCheck,
    indicator: "profileReviews",
    label: "Profile reviews",
  },
  {
    href: "/workspace/research",
    icon: BookOpenText,
    indicator: "researchReviews",
    label: "Papers & datasets review",
  },
  {
    href: "/workspace/project-reviews",
    icon: FolderKanban,
    indicator: "projectReviews",
    label: "Project reviews",
  },
  {
    href: "/workspace/weekly-reports/review",
    icon: NotebookPen,
    indicator: "weeklyReportReviews",
    label: "Weekly report reviews",
  },
];

const ORGANIZATION: readonly WorkspaceNavigationItem[] = [
  { href: "/workspace/users", icon: Users, label: "People & accounts" },
  { href: "/workspace/departments", icon: Building2, label: "Departments" },
  { href: "/workspace/positions", icon: BriefcaseBusiness, label: "Positions" },
  {
    href: "/workspace/applications",
    icon: ClipboardCheck,
    indicator: "applications",
    label: "Applications",
  },
  { href: "/workspace/documents", icon: FileText, label: "Documents" },
];

const GOVERNANCE: readonly WorkspaceNavigationItem[] = [
  {
    href: "/workspace/settings/backups",
    icon: Settings,
    label: "Backup & restore",
  },
  { href: "/workspace/universities", icon: University, label: "Universities" },
  {
    href: "/workspace/settings/verification",
    icon: Settings,
    label: "Policies & ranking",
  },
  { href: "/workspace/content", icon: FilePenLine, label: "Public site" },
];

export function workspaceNavigation(
  role: AuthenticatedUser["role"] | undefined,
): WorkspaceNavigationGroup[] {
  return [
    {
      label: role === "MEMBER" ? "My work" : "Staff",
      items: role === "MEMBER" ? MEMBER_WORK : STAFF_WORK,
    },
    { label: "Research", items: RESEARCH },
    ...(role && role !== "MEMBER" ? [{ label: "Review", items: REVIEW }] : []),
    ...(role === "ADMIN"
      ? [
          { label: "Organization", items: ORGANIZATION },
          { label: "Governance", items: GOVERNANCE },
        ]
      : []),
  ];
}

export function workspaceNavigationItem(
  pathname: string,
  groups: readonly WorkspaceNavigationGroup[],
): WorkspaceNavigationItem | undefined {
  return groups
    .flatMap(({ items }) => items)
    .find(({ href, match }) =>
      isWorkspaceNavigationActive(pathname, href, match),
    );
}

export function isWorkspaceNavigationActive(
  pathname: string,
  href: string,
  match?: "exact",
): boolean {
  return (
    pathname === href ||
    (match !== "exact" &&
      href !== "/workspace" &&
      pathname.startsWith(`${href}/`))
  );
}
