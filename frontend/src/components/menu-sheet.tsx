"use client";

import Link from "next/link";
import { useEffect, useRef, type ReactNode } from "react";
import { ProfileAvatar } from "@/components/profile-avatar";
import { cn } from "@/lib/cn";
import type { AuthenticatedUser } from "@/lib/types";

/** Row style shared by every link and action inside a menu sheet. */
export const menuSheetRowClass =
  "flex h-11 w-full items-center gap-2.5 rounded-control px-3 text-[.86rem] transition-colors hover:bg-surface-subtle";

/**
 * Small-screen menu used by the public site and the workspace: a bottom
 * sheet (native modal dialog, so it renders in the top layer above blurred
 * sticky headers) that always ends with an explicit "Close menu".
 */
export function MenuSheet({
  children,
  label,
  onClose,
  open,
}: {
  children: ReactNode;
  label: string;
  onClose: () => void;
  open: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open && !element.open) element.showModal();
    if (!open && element.open) element.close();
  }, [open]);

  return (
    <dialog
      aria-label={label}
      className="mx-auto mt-auto mb-0 max-h-[calc(100dvh-4rem)] w-full max-w-[520px] border-0 bg-transparent p-2 pb-[max(.5rem,env(safe-area-inset-bottom))] text-ink backdrop:bg-[color-mix(in_srgb,var(--ink)_45%,transparent)] backdrop:backdrop-blur-[2px]"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      ref={dialog}
    >
      <div className="grid max-h-[calc(100dvh-5rem)] animate-[sheet-enter_220ms_cubic-bezier(.22,1,.36,1)_both] gap-2 overflow-y-auto overscroll-contain rounded-dialog border border-line-strong bg-surface p-2 shadow-[var(--shadow-float)] motion-reduce:animate-none">
        {children}
        <button
          className="h-10 cursor-pointer rounded-control border-0 bg-transparent text-[.84rem] text-ink hover:bg-surface-subtle"
          onClick={onClose}
          type="button"
        >
          Close menu
        </button>
      </div>
    </dialog>
  );
}

export function MenuSheetLink({
  active = false,
  children,
  external = false,
  href,
  onClose,
}: {
  active?: boolean;
  children: ReactNode;
  external?: boolean;
  href: string;
  onClose: () => void;
}) {
  return (
    <Link
      aria-current={active ? "page" : undefined}
      className={cn(
        menuSheetRowClass,
        active ? "font-medium text-brand" : "text-ink",
      )}
      href={href}
      onClick={onClose}
      prefetch={false}
      rel={external ? "noopener noreferrer" : undefined}
      target={external ? "_blank" : undefined}
    >
      {children}
    </Link>
  );
}

export function MenuSheetDivider() {
  return <hr className="my-1 border-0 border-t border-line" />;
}

/** Visual unread marker on a menu or avatar trigger; pair with unreadLabel. */
export function UnreadDot({ inside = false }: { inside?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "absolute size-2.5 rounded-full border-2 border-surface bg-brand",
        inside ? "top-1 right-1" : "-top-1 -right-1",
      )}
    />
  );
}

/** Accessible suffix for a trigger that carries an UnreadDot. */
export function unreadLabel(unread: number) {
  return unread
    ? `, ${unread} unread notification${unread === 1 ? "" : "s"}`
    : "";
}

/** Avatar, name, and login email of the signed-in member. */
export function AccountIdentity({ user }: { user: AuthenticatedUser }) {
  const name = user.person?.fullName ?? user.email;
  return (
    <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-3 px-2.5 py-2">
      <ProfileAvatar
        avatarId={user.person?.avatar?.id}
        name={name}
        shape="round"
      />
      <div className="min-w-0">
        <p className="m-0 font-mono text-[.56rem] tracking-[.08em] text-ink-muted uppercase">
          Signed in as
        </p>
        <strong className="block truncate text-[.84rem] font-semibold">
          {name}
        </strong>
        <span className="block truncate text-[.72rem] text-ink-muted">
          {user.email}
        </span>
      </div>
    </div>
  );
}
