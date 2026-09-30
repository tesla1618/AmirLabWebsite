"use client";

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { MoreVertical } from "lucide-react";
import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { cn } from "@/lib/cn";

export function RowActionMenu({
  children,
  disabled = false,
  label = "Row actions",
}: {
  children: ReactNode;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild disabled={disabled}>
        <button
          aria-label={label}
          className="inline-flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-control border border-transparent bg-surface-subtle text-ink-muted transition-colors hover:border-line hover:bg-surface-raised hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
          type="button"
        >
          <MoreVertical aria-hidden="true" size={17} />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          className="z-[90] min-w-[168px] rounded-control border border-line-strong bg-surface p-1.5 shadow-[0_14px_34px_rgb(20_28_24_/_0.14)]"
          sideOffset={5}
        >
          {children}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

export function RowActionMenuItem({
  children,
  className,
  danger = false,
  ...props
}: ComponentPropsWithoutRef<typeof DropdownMenu.Item> & {
  danger?: boolean;
}) {
  return (
    <DropdownMenu.Item
      className={cn(
        "flex min-h-9 cursor-pointer select-none items-center gap-2 rounded-small px-2.5 py-2 text-[.74rem] outline-none transition-colors data-[disabled]:pointer-events-none data-[disabled]:opacity-45 data-[highlighted]:bg-surface-subtle",
        danger
          ? "text-danger data-[highlighted]:text-danger-hover"
          : "text-ink-muted data-[highlighted]:text-ink",
        className,
      )}
      {...props}
    >
      {children}
    </DropdownMenu.Item>
  );
}
