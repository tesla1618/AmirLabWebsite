import type { ReactNode } from "react";
import { workspaceShellClass } from "@/components/ui/workspace-surface";
import { cn } from "@/lib/cn";

interface WorkspacePageShellProps {
  children: ReactNode;
  className?: string;
  description?: string;
  action?: ReactNode;
}

export function WorkspacePageShell({
  children,
  className,
  description,
  action,
}: WorkspacePageShellProps) {
  const headVisible = description || action;
  return (
    <section
      className={cn(
        workspaceShellClass,
        "relative min-h-[calc(100svh-64px)] pt-7 pb-14 max-[820px]:min-h-0",
        className,
      )}
    >
      {headVisible ? (
        <div className="relative mb-5 flex items-center justify-between gap-4 border-b border-line-strong pb-5 max-[640px]:flex-col max-[640px]:items-start">
          {description ? (
            <p className="m-0 max-w-[640px] text-[.76rem] leading-[1.55] text-ink-muted">
              {description}
            </p>
          ) : (
            <span />
          )}
          {action ?? null}
        </div>
      ) : null}
      {children}
    </section>
  );
}
