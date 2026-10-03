"use client";

import Link from "next/link";
import type { ComponentProps } from "react";
import { WorkspaceRow } from "@/components/ui/workspace-surface";
import { cn } from "@/lib/cn";

/** A collection row whose link owns the full width, including the gutters. */
export function WorkspaceRowLink({
  children,
  className,
  loading = false,
  onClick,
  tabIndex,
  ...props
}: ComponentProps<typeof Link> & { loading?: boolean }) {
  return (
    <WorkspaceRow inset={false}>
      <Link
        {...props}
        aria-disabled={loading || undefined}
        className={cn(
          "min-w-0 px-[var(--workspace-gutter)] text-inherit transition-colors",
          loading
            ? "pointer-events-none cursor-default"
            : "cursor-pointer hover:bg-surface-subtle focus-visible:bg-surface-subtle focus-visible:outline-none focus-visible:shadow-[inset_0_0_0_2px_var(--brand)]",
          className,
        )}
        data-loading={loading || undefined}
        onClick={(event) => {
          if (loading) {
            event.preventDefault();
            return;
          }
          onClick?.(event);
        }}
        tabIndex={loading ? -1 : tabIndex}
      >
        {children}
      </Link>
    </WorkspaceRow>
  );
}
