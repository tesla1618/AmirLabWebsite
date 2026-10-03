"use client";

import { loadingPlaceholder } from "@/lib/loading-style";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import {
  ArrowUpRight,
  Bell,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { ConfirmDialog } from "@/components/confirm-dialog";
import {
  AccountIdentity,
  MenuSheet,
  MenuSheetDivider,
  MenuSheetLink,
  UnreadDot,
  accountTriggerClass,
  menuTriggerClass,
  menuSheetRowClass,
  unreadLabel,
} from "@/components/menu-sheet";
import { useNotifications } from "@/components/notification-provider";
import { ProfileAvatar } from "@/components/profile-avatar";
import { CountPill } from "@/components/ui/count-pill";
import {
  FrameBays,
  FramePattern,
  FrameRails,
  FrameRule,
} from "@/components/ui/public-shell";
import { workspaceShellClass } from "@/components/ui/workspace-surface";
import { cn } from "@/lib/cn";
import {
  isWorkspaceNavigationActive,
  workspaceNavigation,
  workspaceNavigationItem,
} from "@/lib/workspace-navigation";

export function WorkspaceShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { loading, logout, user } = useAuth();
  const { queueCounts, unreadCount } = useNotifications();
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    // The collapsed/expanded preference only applies to the desktop sidebar;
    // small screens use the workspace menu sheet instead.
    try {
      const stored = localStorage.getItem("amirlab:sidebar-open");
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (stored !== null) setSidebarOpen(stored === "true");
    } catch {}
  }, []);

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, router, user]);

  const toggleSidebar = () => {
    setSidebarOpen((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("amirlab:sidebar-open", String(next));
      } catch {}
      return next;
    });
  };

  const accountName = user?.person?.fullName ?? user?.email ?? "AmirLab member";
  const navigationGroups = workspaceNavigation(user?.role);
  const currentLabel =
    workspaceNavigationItem(pathname, navigationGroups)?.label ?? "Workspace";

  return (
    <div data-site="workspace" data-loading={loading || !user || undefined}>
      <div
        className={cn(
          "grid min-h-screen w-full items-stretch bg-canvas transition-[grid-template-columns] duration-300 ease-in-out max-[820px]:block",
          sidebarOpen
            ? "grid-cols-[264px_minmax(0,1fr)]"
            : "grid-cols-[58px_minmax(0,1fr)]",
        )}
      >
        <aside className="sticky top-0 flex h-screen min-w-0 flex-col overflow-x-hidden overflow-y-auto [scrollbar-gutter:stable] [scrollbar-width:thin] border-r border-line-strong bg-surface pb-4 max-[820px]:hidden">
          <div
            className={cn(
              "relative z-[6] flex h-[64px] shrink-0 items-center gap-2 border-b border-line-strong",
              sidebarOpen
                ? "justify-between px-[.85rem]"
                : "justify-center px-0",
            )}
          >
            {sidebarOpen ? (
              <div className="grid min-w-0 gap-[2px]">
                <strong className="truncate text-[.8rem] font-semibold">
                  Workspace
                </strong>
                <span className="truncate text-[.6rem] text-ink-muted">
                  {loading || !user ? "Research workspace" : user.email}
                </span>
              </div>
            ) : null}
            <button
              aria-label={sidebarOpen ? "Close sidebar" : "Open sidebar"}
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-control text-ink-muted transition-colors hover:bg-surface-subtle hover:text-ink"
              onClick={toggleSidebar}
              type="button"
            >
              {sidebarOpen ? (
                <PanelLeftClose aria-hidden="true" size={18} />
              ) : (
                <PanelLeftOpen aria-hidden="true" size={18} />
              )}
            </button>
          </div>
          <nav
            aria-label="Workspace navigation"
            className={cn(
              "relative z-[6] mt-[.6rem] grid gap-[.35rem]",
              sidebarOpen ? "px-[.85rem]" : "px-[.4rem]",
            )}
          >
            {navigationGroups.map((group) => (
              <div
                className="grid gap-0 border-b border-line pb-[.4rem]"
                key={group.label}
              >
                {sidebarOpen ? (
                  <span className="px-[.45rem] pt-[.28rem] pb-[.38rem] font-mono text-[.55rem] tracking-[.105em] text-ink-faint uppercase">
                    {group.label}
                  </span>
                ) : (
                  <div className="h-[12px]" />
                )}
                {group.items.map((item) => {
                  const { href, icon: Icon, indicator, label } = item;
                  const active = isWorkspaceNavigationActive(
                    pathname,
                    href,
                    item.match,
                  );
                  const indicatorCount =
                    indicator === "notifications"
                      ? unreadCount
                      : indicator
                        ? queueCounts[indicator]
                        : 0;
                  return (
                    <Link
                      className={cn(
                        "flex min-h-[34px] items-center gap-2 border-l-2 py-[.42rem] text-[.73rem] font-medium transition-colors hover:bg-surface-subtle hover:text-ink",
                        sidebarOpen
                          ? "px-[.48rem]"
                          : "justify-center px-0 relative",
                        active
                          ? "border-l-brand bg-surface-subtle text-ink"
                          : "border-l-transparent text-ink-muted",
                      )}
                      href={href}
                      key={href}
                      title={!sidebarOpen ? label : undefined}
                    >
                      <Icon aria-hidden="true" size={17} className="shrink-0" />
                      <span
                        className={cn(
                          "whitespace-nowrap",
                          !sidebarOpen && "hidden",
                        )}
                      >
                        {label}
                      </span>
                      {sidebarOpen && indicatorCount > 0 ? (
                        <CountPill className="ml-auto" count={indicatorCount} />
                      ) : !sidebarOpen && indicatorCount > 0 ? (
                        <div className="absolute top-1 right-[.35rem] h-[6px] w-[6px] rounded-full bg-brand" />
                      ) : null}
                    </Link>
                  );
                })}
              </div>
            ))}
          </nav>
          <div
            className={cn(
              "mt-auto grid gap-[.15rem] pt-[.8rem]",
              sidebarOpen ? "px-[.85rem]" : "px-[.4rem]",
            )}
          >
            <button
              title={!sidebarOpen ? "Log out" : undefined}
              className={cn(
                "flex min-h-[38px] w-full cursor-pointer items-center gap-[.45rem] border-0 bg-transparent py-[.45rem] text-[.75rem] font-semibold text-danger transition-colors hover:text-danger-hover disabled:cursor-not-allowed disabled:opacity-55",
                sidebarOpen
                  ? "justify-between px-[.7rem]"
                  : "justify-center px-0",
              )}
              disabled={loading || !user}
              onClick={() => setConfirmLogout(true)}
              type="button"
            >
              {sidebarOpen ? (
                <span className="inline-flex items-center gap-[.45rem]">
                  <LogOut aria-hidden="true" size={15} className="shrink-0" />{" "}
                  Log out
                </span>
              ) : (
                <LogOut aria-hidden="true" size={17} className="shrink-0" />
              )}
            </button>
            {sidebarOpen && (
              <Link
                className="flex min-h-[38px] items-center justify-between gap-[.45rem] px-[.7rem] py-[.45rem] text-[.75rem] text-ink-muted transition-colors hover:text-brand whitespace-nowrap"
                href="/"
                target="_blank"
              >
                Public website{" "}
                <ArrowUpRight
                  aria-hidden="true"
                  size={15}
                  className="shrink-0"
                />
              </Link>
            )}
          </div>
          <FramePattern
            className="mt-3 h-[58px] shrink-0 border-t border-line-strong"
            variant="grid"
          />
        </aside>
        <div className="relative grid min-w-0 grid-rows-[64px_minmax(0,1fr)] max-[820px]:min-h-svh max-[820px]:grid-rows-[55px_minmax(0,1fr)]">
          <FrameRails tone="quiet" />
          <header className="sticky top-0 z-30 min-h-[64px] bg-surface/95 backdrop-blur-[12px] max-[820px]:min-h-[55px]">
            <FrameBays pattern="grid" />
            <FrameRails tone="quiet" />
            <FrameRule edge="bottom" nodeSurface="surface" scope="parent" />
            {/* Small screens: page title + menu button only. The button sits
                7px from the header top, the bottom rule (pb-px), and the rail,
                matching the public site header. */}
            <div
              className={cn(
                workspaceShellClass,
                "relative z-[6] flex min-h-[64px] items-center justify-between bg-surface py-[.45rem] max-[820px]:min-h-[55px] max-[820px]:pt-0 max-[820px]:pb-px",
              )}
            >
              <div className="flex min-w-0 items-center gap-[clamp(.5rem,2vw,1rem)]">
                <h1
                  className={cn(
                    "m-0 truncate font-serif text-[1.65rem] leading-none font-medium tracking-[-.025em] max-[820px]:font-sans max-[820px]:text-[1rem] max-[820px]:tracking-[-.01em]",
                    loadingPlaceholder(loading || !user, "text"),
                  )}
                  data-placeholder={loading || !user ? "text" : undefined}
                >
                  {loading || !user ? "Workspace" : currentLabel}
                </h1>
              </div>
              <button
                aria-expanded={menuOpen}
                aria-haspopup="dialog"
                aria-label={`Open workspace menu${unreadLabel(unreadCount)}`}
                className={cn(
                  menuTriggerClass,
                  "-mr-[calc(var(--workspace-gutter)_-_8px)] hidden max-[820px]:inline-flex",
                )}
                onClick={() => setMenuOpen(true)}
                type="button"
              >
                <Menu aria-hidden="true" />
                {unreadCount ? <UnreadDot /> : null}
              </button>
              <div className="flex items-center gap-[.55rem] max-[820px]:hidden">
                <Link
                  aria-label={`${unreadCount} unread notification${unreadCount === 1 ? "" : "s"}`}
                  className="relative inline-flex h-9 w-9 items-center justify-center rounded-control text-ink-muted transition-colors hover:bg-surface-subtle hover:text-ink"
                  href="/workspace/notifications"
                >
                  <Bell aria-hidden="true" size={20} />
                  {unreadCount > 0 ? (
                    <span className="absolute -top-1 -right-1 inline-flex min-h-4 min-w-4 items-center justify-center rounded-[8px] bg-brand px-1 font-mono text-[.48rem] text-on-accent">
                      {unreadCount > 99 ? "99+" : unreadCount}
                    </span>
                  ) : null}
                </Link>
                <Link
                  className={accountTriggerClass}
                  href="/workspace/profile"
                  title={accountName}
                >
                  <ProfileAvatar
                    avatarId={user?.person?.avatar?.id}
                    loading={loading || !user}
                    name={accountName}
                    shape="round"
                    size="md"
                  />
                </Link>
              </div>
            </div>
          </header>
          <div
            className={cn(
              "relative z-[1] min-w-0",
              pathname === "/workspace/chat"
                ? "min-h-0 overflow-hidden p-0"
                : "p-0",
            )}
          >
            {loading || !user ? null : children}
          </div>
        </div>
      </div>
      <MenuSheet
        label="Workspace menu"
        onClose={() => setMenuOpen(false)}
        open={menuOpen}
      >
        {user ? <AccountIdentity user={user} /> : null}
        <nav aria-label="Workspace navigation" className="grid">
          {navigationGroups.map((group) => (
            <div className="grid" key={group.label}>
              <MenuSheetDivider />
              <p className="m-0 px-3 pt-2 pb-1 font-mono text-[.55rem] tracking-[.105em] text-ink-faint uppercase">
                {group.label}
              </p>
              {group.items.map((item) => {
                const { href, icon: Icon, indicator, label } = item;
                const indicatorCount =
                  indicator === "notifications"
                    ? unreadCount
                    : indicator
                      ? queueCounts[indicator]
                      : 0;
                return (
                  <MenuSheetLink
                    active={isWorkspaceNavigationActive(
                      pathname,
                      href,
                      item.match,
                    )}
                    href={href}
                    key={href}
                    onClose={() => setMenuOpen(false)}
                  >
                    <Icon aria-hidden="true" className="shrink-0" size={17} />
                    {label}
                    {indicatorCount > 0 ? (
                      <CountPill
                        className="ml-auto text-brand"
                        count={indicatorCount}
                      />
                    ) : null}
                  </MenuSheetLink>
                );
              })}
            </div>
          ))}
        </nav>
        <MenuSheetDivider />
        <MenuSheetLink external href="/" onClose={() => setMenuOpen(false)}>
          Public website
          <ArrowUpRight aria-hidden="true" className="ml-auto" size={15} />
        </MenuSheetLink>
        <button
          className={cn(
            menuSheetRowClass,
            "cursor-pointer border-0 bg-transparent font-semibold text-danger disabled:cursor-not-allowed disabled:opacity-55",
          )}
          disabled={loading || !user}
          onClick={() => {
            setMenuOpen(false);
            setConfirmLogout(true);
          }}
          type="button"
        >
          <LogOut aria-hidden="true" className="shrink-0" size={17} />
          Log out
        </button>
      </MenuSheet>
      <ConfirmDialog
        busy={loggingOut}
        confirmLabel="Log out"
        description="You will be signed out of this workspace and returned to the login page."
        onCancel={() => setConfirmLogout(false)}
        onConfirm={() => {
          setLoggingOut(true);
          void logout();
        }}
        open={confirmLogout}
        title="Log out of AmirLab?"
        tone="danger"
      />
    </div>
  );
}
