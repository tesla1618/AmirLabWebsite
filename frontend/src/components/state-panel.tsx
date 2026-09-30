"use client";

import { AlertTriangle, Inbox, SearchX, ShieldAlert } from "lucide-react";
import type { ReactNode } from "react";
import { ButtonControl, ButtonLink } from "@/components/ui/button-control";
import { FramedCollection } from "@/components/ui/public-shell";
import { WorkspaceRuleBand } from "@/components/ui/workspace-surface";
import { cn } from "@/lib/cn";

const ICONS = {
  empty: Inbox,
  error: AlertTriangle,
  filtered: SearchX,
  permission: ShieldAlert,
} as const;

export function StatePanel({
  action,
  body,
  frame = false,
  title,
  variant = "empty",
}: {
  action?: { href?: string; label: string; onClick?: () => void };
  body: ReactNode;
  frame?: boolean | "workspace";
  title: string;
  variant?: keyof typeof ICONS;
}) {
  const Icon = ICONS[variant];
  const iconTone =
    variant === "error"
      ? "border-danger text-danger"
      : variant === "permission"
        ? "border-warning text-warning"
        : "border-line text-ink-muted";
  const panel = (
    <div
      className={cn(
        "relative flex flex-col items-center bg-transparent text-center",
        frame === "workspace"
          ? "px-6 py-10"
          : "border-y border-line-strong px-8 py-16",
      )}
      role={variant === "error" ? "alert" : "status"}
    >
      <span
        className={cn(
          "mb-4 flex h-10 w-10 items-center justify-center border bg-canvas",
          iconTone,
        )}
      >
        <Icon aria-hidden="true" size={18} />
      </span>
      <h2 className="font-sans text-[1rem] font-medium">{title}</h2>
      <div className="mx-auto mt-[.45rem] mb-4 max-w-[420px] text-[.76rem] leading-[1.55] text-ink-muted">
        {body}
      </div>
      {action?.href ? (
        <ButtonLink href={action.href}>{action.label}</ButtonLink>
      ) : action?.onClick ? (
        <ButtonControl onClick={action.onClick}>{action.label}</ButtonControl>
      ) : null}
    </div>
  );

  if (frame === "workspace") {
    return (
      <WorkspaceRuleBand contentClassName="px-0">{panel}</WorkspaceRuleBand>
    );
  }
  return frame ? <FramedCollection>{panel}</FramedCollection> : panel;
}
