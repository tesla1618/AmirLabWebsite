import type { ComponentPropsWithoutRef } from "react";
import { cn } from "@/lib/cn";
import { WorkspaceRuleBand } from "@/components/ui/workspace-surface";

export function DataTableShell({
  className,
  ...props
}: ComponentPropsWithoutRef<"div">) {
  return <div className={cn("grid min-w-0 gap-4", className)} {...props} />;
}

export function DataTableCard({
  children,
  className,
  ...props
}: ComponentPropsWithoutRef<"div">) {
  return (
    <WorkspaceRuleBand
      className={className}
      contentClassName="overflow-x-auto !px-0"
      {...props}
    >
      {children}
    </WorkspaceRuleBand>
  );
}

export function DataTable({
  className,
  ...props
}: ComponentPropsWithoutRef<"table">) {
  return (
    <table
      className={cn(
        "w-full min-w-[760px] border-collapse text-[.77rem]",
        className,
      )}
      {...props}
    />
  );
}

export function DataTableHeadCell({
  className,
  ...props
}: ComponentPropsWithoutRef<"th">) {
  return (
    <th
      className={cn(
        "border-b border-table-line px-[.85rem] py-[.65rem] text-left font-mono text-[.64rem] font-medium uppercase tracking-[.06em] text-ink-muted first:pl-[var(--workspace-gutter)] last:pr-[var(--workspace-gutter)]",
        className,
      )}
      {...props}
    />
  );
}

export function DataTableCell({
  className,
  ...props
}: ComponentPropsWithoutRef<"td">) {
  return (
    <td
      className={cn(
        "border-b border-line px-[.85rem] py-[.7rem] align-middle first:pl-[var(--workspace-gutter)] last:pr-[var(--workspace-gutter)]",
        className,
      )}
      {...props}
    />
  );
}

export function DataTableRow({
  className,
  clickable = false,
  ...props
}: ComponentPropsWithoutRef<"tr"> & { clickable?: boolean }) {
  return (
    <tr
      className={cn(
        "last:[&>td]:border-b-0 hover:[&>td]:bg-canvas",
        clickable &&
          "cursor-pointer focus-visible:outline-none focus-visible:[&>td]:bg-brand-faint",
        className,
      )}
      {...props}
    />
  );
}
