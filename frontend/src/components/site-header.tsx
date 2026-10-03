"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { LogOut, Menu } from "lucide-react";
import { useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { BrandLockup } from "@/components/brand-mark";
import { useNotifications } from "@/components/notification-provider";
import { ProfileAvatar } from "@/components/profile-avatar";
import { ButtonControl, ButtonLink } from "@/components/ui/button-control";
import { CountPill } from "@/components/ui/count-pill";
import {
  AccountIdentity,
  accountTriggerClass,
  menuTriggerClass,
  MenuSheet,
  MenuSheetDivider,
  MenuSheetLink,
  UnreadDot,
  unreadLabel,
} from "@/components/menu-sheet";
import { RowActionMenuItem } from "@/components/ui/row-action-menu";
import type { AuthenticatedUser } from "@/lib/types";
import {
  FrameBays,
  FrameRails,
  FrameRule,
  publicShellClass,
} from "@/components/ui/public-shell";
import { cn } from "@/lib/cn";

const NAVIGATION = [
  ["About", "/about"],
  ["People", "/people"],
  ["Departments", "/departments"],
  ["Papers", "/papers"],
  ["Datasets", "/datasets"],
  ["Projects", "/projects"],
  ["Open positions", "/open-positions"],
] as const;

export function SiteHeader() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const { loading, logout, user } = useAuth();
  const { loading: notificationsLoading, unreadCount } = useNotifications();
  // Only signed-in members have notifications; hide the count until known.
  const unread = user && !notificationsLoading ? unreadCount : 0;

  return (
    <header className="sticky top-0 z-[60] bg-[color-mix(in_srgb,var(--surface)_94%,transparent)] backdrop-blur-[12px]">
      <FrameBays pattern="grid" />
      <FrameRails />
      <FrameRule edge="bottom" nodeSurface="surface" scope="parent" />
      <div
        className={cn(
          publicShellClass,
          "relative z-[6] grid min-h-[55px] grid-cols-[minmax(230px,.8fr)_minmax(0,1.5fr)_auto] items-center gap-[clamp(1rem,2.2vw,2.2rem)] max-[1050px]:grid-cols-[minmax(0,1fr)_auto] max-[1050px]:pb-px",
        )}
      >
        <Link
          className="inline-flex w-fit min-w-0 items-center"
          href="/"
          prefetch={false}
        >
          <BrandLockup />
        </Link>
        <nav
          aria-label="Main navigation"
          className="flex min-w-0 items-stretch justify-center gap-[clamp(.75rem,1.4vw,1.35rem)] max-[1050px]:hidden"
        >
          {NAVIGATION.map(([label, href]) => (
            <Link
              className={cn(
                "flex min-h-[55px] items-center border-b-2 border-b-transparent text-[.8rem] font-medium whitespace-nowrap text-ink-muted hover:text-ink-strong",
                pathname === href && "border-b-brand text-ink-strong",
              )}
              href={href}
              key={href}
              prefetch={false}
            >
              {label}
            </Link>
          ))}
        </nav>
        {/* Account + menu share one cell. On small screens the menu button
            sits the same distance (7px) from the header top, the bottom rule
            (pb-px keeps it centred above the rule), and the inner rail. Below
            1051px all account actions live in the menu sheet. */}
        <div className="flex items-center justify-end gap-2 max-[1050px]:-mr-[calc(var(--public-gutter)_-_8px)]">
          <div className="flex min-w-16 justify-end max-[1050px]:hidden">
            {loading ? (
              <span
                aria-label="Loading account"
                className="pointer-events-none"
                role="status"
              >
                <ProfileAvatar loading name="Account" shape="round" />
              </span>
            ) : user ? (
              <AccountMenu onLogout={logout} unread={unread} user={user} />
            ) : (
              <Link
                className="inline-flex min-h-[var(--control-height)] items-center justify-center rounded-control border border-line-strong bg-transparent px-[.78rem] py-2 text-[.78rem] font-semibold hover:bg-brand-faint"
                href="/login"
                prefetch={false}
              >
                Log in
              </Link>
            )}
          </div>
          <button
            aria-expanded={open}
            aria-haspopup="dialog"
            aria-label={`Open menu${unreadLabel(unread)}`}
            className={cn(menuTriggerClass, "hidden max-[1050px]:inline-flex")}
            onClick={() => setOpen(true)}
            type="button"
          >
            <Menu aria-hidden="true" />
            {unread ? <UnreadDot /> : null}
          </button>
        </div>
      </div>
      <SiteMenuSheet
        onLogout={logout}
        onClose={() => setOpen(false)}
        open={open}
        pathname={pathname}
        unread={unread}
        user={user}
      />
    </header>
  );
}

/** Small-screen site menu: account, every destination, and sign-in. */
function SiteMenuSheet({
  onLogout,
  onClose,
  open,
  pathname,
  unread,
  user,
}: {
  onClose: () => void;
  onLogout: () => Promise<void>;
  open: boolean;
  pathname: string;
  unread: number;
  user: AuthenticatedUser | null;
}) {
  return (
    <MenuSheet label="Site menu" onClose={onClose} open={open}>
      {user ? (
        <div className="grid">
          <AccountIdentity user={user} />
          <MenuSheetLink href="/workspace/notifications" onClose={onClose}>
            Notifications
            {unread ? (
              <CountPill className="ml-auto text-brand" count={unread} />
            ) : null}
          </MenuSheetLink>
          <MenuSheetDivider />
        </div>
      ) : null}
      <nav aria-label="Site menu" className="grid">
        <MenuSheetLink active={pathname === "/"} href="/" onClose={onClose}>
          Home
        </MenuSheetLink>
        <MenuSheetDivider />
        {NAVIGATION.map(([label, href]) => (
          <MenuSheetLink
            active={pathname === href}
            href={href}
            key={href}
            onClose={onClose}
          >
            {label}
          </MenuSheetLink>
        ))}
      </nav>
      <ButtonLink
        className="w-full justify-center"
        href={user ? "/workspace" : "/login"}
        onClick={onClose}
        prefetch={false}
        variant={user ? "secondary" : "primary"}
      >
        {user ? "Open workspace" : "Log in"}
      </ButtonLink>
      {user ? (
        <ButtonControl
          className="w-full justify-center"
          onClick={() => {
            onClose();
            void onLogout();
          }}
          variant="danger-ghost"
        >
          <LogOut aria-hidden="true" size={16} />
          Log out
        </ButtonControl>
      ) : null}
    </MenuSheet>
  );
}

/** Desktop account menu: identity, notifications, workspace access, and logout. */
function AccountMenu({
  onLogout,
  unread,
  user,
}: {
  onLogout: () => Promise<void>;
  unread: number;
  user: AuthenticatedUser;
}) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          aria-label={`Account menu${unreadLabel(unread)}`}
          className={accountTriggerClass}
          type="button"
        >
          <ProfileAvatar
            avatarId={user.person?.avatar?.id}
            name={user.person?.fullName ?? user.email}
            shape="round"
          />
          {unread ? <UnreadDot /> : null}
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          className="z-[90] grid w-64 animate-[popover-enter_160ms_ease-out_both] gap-0.5 rounded-control border border-line-strong bg-surface p-1.5 shadow-[var(--shadow-float)] motion-reduce:animate-none"
          sideOffset={8}
        >
          <AccountIdentity user={user} />
          <DropdownMenu.Separator className="my-1 h-px bg-line" />
          <RowActionMenuItem asChild className="justify-between">
            <Link href="/workspace/notifications" prefetch={false}>
              Notifications
              {unread ? (
                <CountPill className="text-brand" count={unread} />
              ) : null}
            </Link>
          </RowActionMenuItem>
          <RowActionMenuItem asChild>
            <Link href="/workspace" prefetch={false}>
              Open workspace
            </Link>
          </RowActionMenuItem>
          <DropdownMenu.Separator className="my-1 h-px bg-line" />
          <RowActionMenuItem danger onSelect={() => void onLogout()}>
            <LogOut aria-hidden="true" size={15} />
            Log out
          </RowActionMenuItem>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
