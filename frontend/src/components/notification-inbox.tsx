"use client";

import { cn } from "@/lib/cn";
import { loadingPlaceholder } from "@/lib/loading-style";
import { useRouter } from "next/navigation";
import { ArrowUpRight, Check, RotateCcw } from "lucide-react";
import { useEffect, useState } from "react";
import { useNotifications } from "@/components/notification-provider";
import { PaginationControls } from "@/components/pagination-controls";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { Badge } from "@/components/ui/badge";
import { SelectControl } from "@/components/ui/select-control";
import { FormField } from "@/components/ui/form-field";
import { ButtonControl } from "@/components/ui/button-control";
import {
  RowActionMenu,
  RowActionMenuItem,
} from "@/components/ui/row-action-menu";
import { ApiRequestError, apiRequest } from "@/lib/client-api";
import type { NotificationRecord, PaginatedResponse } from "@/lib/types";
import { StatePanel } from "@/components/state-panel";
import {
  ReviewIssueStamp,
  SemanticStatus,
} from "@/components/ui/semantic-status";
import { useReviewIssues } from "@/lib/use-review-issues";
import {
  WorkspaceCollection,
  WorkspaceRow,
  WorkspaceRuleBand,
} from "@/components/ui/workspace-surface";

interface NotificationPage extends PaginatedResponse<NotificationRecord> {
  unreadCount: number;
}

export function NotificationInbox() {
  const router = useRouter();
  const { markOneRead, refreshUnreadCount, showToast } = useNotifications();
  const itemIssues = useReviewIssues();
  const [result, setResult] = useState<NotificationPage>();
  const [page, setPage] = useState(1);
  const [read, setRead] = useState("ALL");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [markingIds, setMarkingIds] = useState<Set<string>>(() => new Set());

  function beginMarking(id: string) {
    setMarkingIds((current) => new Set(current).add(id));
  }

  function endMarking(id: string) {
    setMarkingIds((current) => {
      const next = new Set(current);
      next.delete(id);
      return next;
    });
  }
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let active = true;
    const params = new URLSearchParams({ page: String(page), pageSize: "20" });
    if (read !== "ALL") params.set("read", read);
    if (from) params.set("from", from);
    if (to) params.set("to", to);

    void apiRequest<NotificationPage>(`/notifications?${params}`, {
      method: "GET",
    })
      .then((response) => {
        if (!active) return;
        setError(undefined);
        setResult(response);
      })
      .catch((caught: unknown) => {
        if (active) {
          setError(
            caught instanceof Error
              ? caught.message
              : "Unable to load notifications.",
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [from, page, read, reload, to]);

  function beginReload() {
    setLoading(true);
    setError(undefined);
  }

  async function markRead(notification: NotificationRecord) {
    if (notification.readAt) return;
    beginMarking(notification.id);
    try {
      const response = await apiRequest<{ updated: boolean }>(
        `/notifications/${notification.id}/read`,
        { method: "PATCH" },
      );
      if (response.updated) {
        setResult((current) =>
          current
            ? {
                ...current,
                items: current.items.map((item) =>
                  item.id === notification.id
                    ? { ...item, readAt: new Date().toISOString() }
                    : item,
                ),
                unreadCount: Math.max(0, current.unreadCount - 1),
              }
            : current,
        );
        itemIssues.clearOne(notification.id);
        markOneRead();
        if (read === "UNREAD") {
          setResult((current) =>
            current
              ? {
                  ...current,
                  items: current.items.filter(
                    (item) => item.id !== notification.id,
                  ),
                  total: Math.max(0, current.total - 1),
                  totalPages: Math.ceil(
                    Math.max(0, current.total - 1) / current.pageSize,
                  ),
                }
              : current,
          );
        }
      }
    } catch (caught) {
      const requestError =
        caught instanceof ApiRequestError ? caught : undefined;
      itemIssues.setOne(notification.id, {
        code: "NOTIFICATION_UPDATE_FAILED",
        message: "This notification could not be marked as read.",
        tone: "error",
      });
      showToast({
        body:
          requestError?.message ?? "This notification could not be updated.",
        title: "Notification was not updated",
        tone: "error",
      });
      void refreshUnreadCount().catch(() => undefined);
    } finally {
      endMarking(notification.id);
    }
  }

  async function markUnread(notification: NotificationRecord) {
    if (!notification.readAt) return;
    beginMarking(notification.id);
    try {
      const response = await apiRequest<{ updated: boolean }>(
        `/notifications/${notification.id}/unread`,
        { method: "PATCH" },
      );
      if (response.updated) {
        setResult((current) =>
          current
            ? {
                ...current,
                items:
                  read === "READ"
                    ? current.items.filter(
                        (item) => item.id !== notification.id,
                      )
                    : current.items.map((item) =>
                        item.id === notification.id
                          ? { ...item, readAt: null }
                          : item,
                      ),
                total:
                  read === "READ"
                    ? Math.max(0, current.total - 1)
                    : current.total,
                totalPages:
                  read === "READ"
                    ? Math.ceil(
                        Math.max(0, current.total - 1) / current.pageSize,
                      )
                    : current.totalPages,
                unreadCount: current.unreadCount + 1,
              }
            : current,
        );
        itemIssues.clearOne(notification.id);
        void refreshUnreadCount().catch(() => undefined);
      }
    } catch (caught) {
      const requestError =
        caught instanceof ApiRequestError ? caught : undefined;
      itemIssues.setOne(notification.id, {
        code: "NOTIFICATION_UPDATE_FAILED",
        message: "This notification could not be marked as unread.",
        tone: "error",
      });
      showToast({
        body:
          requestError?.message ?? "This notification could not be updated.",
        title: "Notification was not updated",
        tone: "error",
      });
      void refreshUnreadCount().catch(() => undefined);
    } finally {
      endMarking(notification.id);
    }
  }

  async function openNotification(notification: NotificationRecord) {
    if (!notification.actionUrl) return;
    if (!notification.readAt) {
      await markRead(notification);
    }
    router.push(notification.actionUrl);
  }

  return (
    <div className="grid min-w-0 gap-4">
      <WorkspaceRuleBand contentClassName="grid min-w-0 grid-cols-[minmax(180px,.8fr)_minmax(220px,1fr)_auto] items-end gap-[.8rem] px-[var(--workspace-gutter)] py-3.5 max-[960px]:grid-cols-2 max-[640px]:grid-cols-1 max-[640px]:px-4">
        <FormField htmlFor="notification-status" label="Status">
          <SelectControl
            id="notification-status"
            onValueChange={(value) => {
              beginReload();
              setRead(value);
              setPage(1);
            }}
            options={[
              { label: "All notifications", value: "ALL" },
              { label: "Unread only", value: "UNREAD" },
              { label: "Read only", value: "READ" },
            ]}
            value={read}
          />
        </FormField>
        <FormField label="Date range">
          <DateRangePicker
            from={from}
            onChange={(range) => {
              beginReload();
              setFrom(range.from);
              setTo(range.to);
              setPage(1);
            }}
            to={to}
          />
        </FormField>
        <ButtonControl
          disabled={!from && !to && read === "ALL"}
          onClick={() => {
            beginReload();
            setFrom("");
            setTo("");
            setRead("ALL");
            setPage(1);
          }}
        >
          Clear filters
        </ButtonControl>
      </WorkspaceRuleBand>

      {error && !result ? (
        <StatePanel
          frame="workspace"
          action={{
            label: "Retry",
            onClick: () => {
              beginReload();
              setReload((value) => value + 1);
            },
          }}
          body="The connection dropped. Nothing was lost; reconnect to continue."
          title="Could not load notifications"
          variant="error"
        />
      ) : loading || result?.items.length ? (
        <>
          <WorkspaceCollection
            aria-live="polite"
            data-loading={loading || undefined}
          >
            {(loading && !result?.items.length
              ? Array.from({ length: 5 }, () => undefined)
              : (result?.items ?? [])
            ).map((notification, index) => (
              <WorkspaceRow
                className={`relative grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-5 bg-transparent py-[.82rem] [overflow-wrap:anywhere] max-[640px]:grid-cols-[minmax(0,1fr)_auto] max-[640px]:gap-3 ${notification?.readAt ? "" : "before:absolute before:inset-y-0 before:left-[calc(var(--workspace-gutter)*-1)] before:w-[2px] before:bg-brand before:content-[''] max-[640px]:before:left-0"}`}
                key={notification?.id ?? `notification-loading-${index}`}
              >
                {notification ? (
                  <ReviewIssueStamp
                    issue={itemIssues.forItem(notification.id)[0]}
                  />
                ) : null}
                <div>
                  <div className="flex flex-wrap items-center gap-[.65rem] text-[.72rem] text-ink-muted">
                    <Badge loading={loading}>
                      {notification?.readAt ? "Read" : "New"}
                    </Badge>
                    <time
                      className={loadingPlaceholder(loading, "label", "medium")}
                      data-placeholder="label"
                      data-placeholder-width="medium"
                      dateTime={notification?.createdAt}
                    >
                      {notification?.createdAt
                        ? new Date(notification.createdAt).toLocaleString()
                        : "Loading date"}
                    </time>
                  </div>
                  <h2
                    className={cn(
                      "mt-[.35rem] text-[.96rem] font-medium leading-[1.35]",
                      loadingPlaceholder(loading, "text", "long"),
                    )}
                    data-placeholder="text"
                    data-placeholder-width="long"
                  >
                    {notification?.title ?? "Loading notification title"}
                  </h2>
                  <p
                    className={cn(
                      "mt-[.3rem] text-[.76rem] leading-[1.5] text-ink-muted",
                      loadingPlaceholder(loading, "text", "full"),
                    )}
                    data-placeholder="text"
                    data-placeholder-width="full"
                  >
                    {notification?.body ?? "Loading notification details"}
                  </p>
                  {notification && itemIssues.forItem(notification.id)[0] ? (
                    <SemanticStatus
                      className="mt-3"
                      tone={
                        itemIssues.forItem(notification.id)[0].tone ?? "error"
                      }
                    >
                      {itemIssues.forItem(notification.id)[0].message}
                    </SemanticStatus>
                  ) : null}
                </div>
                <div className="flex items-center justify-end gap-1.5 self-center">
                  {loading || notification?.actionUrl ? (
                    <button
                      className="inline-flex h-8 cursor-pointer items-center gap-1.5 border-0 bg-transparent px-2 text-[.72rem] font-medium text-brand transition-colors hover:text-brand-hover disabled:cursor-not-allowed disabled:opacity-45"
                      disabled={!notification}
                      onClick={() =>
                        notification && void openNotification(notification)
                      }
                      type="button"
                    >
                      Open <ArrowUpRight aria-hidden="true" size={14} />
                    </button>
                  ) : null}
                  <RowActionMenu
                    disabled={
                      !notification || markingIds.has(notification?.id ?? "")
                    }
                    label="Notification actions"
                  >
                    <RowActionMenuItem
                      onSelect={() =>
                        notification &&
                        void (notification.readAt
                          ? markUnread(notification)
                          : markRead(notification))
                      }
                    >
                      {notification?.readAt ? (
                        <>
                          <RotateCcw aria-hidden="true" size={15} /> Mark unread
                        </>
                      ) : (
                        <>
                          <Check aria-hidden="true" size={15} /> Mark read
                        </>
                      )}
                    </RowActionMenuItem>
                  </RowActionMenu>
                </div>
              </WorkspaceRow>
            ))}
          </WorkspaceCollection>
          <PaginationControls
            loading={loading}
            onPageChange={(nextPage) => {
              beginReload();
              setPage(nextPage);
            }}
            page={page}
            pageSize={result?.pageSize ?? 20}
            total={result?.total}
            totalPages={result?.totalPages ?? 1}
          />
        </>
      ) : (
        <StatePanel
          frame="workspace"
          action={
            from || to || read !== "ALL"
              ? {
                  label: "Clear filters",
                  onClick: () => {
                    beginReload();
                    setFrom("");
                    setTo("");
                    setRead("ALL");
                    setPage(1);
                  },
                }
              : undefined
          }
          body={
            from || to || read !== "ALL"
              ? "Try a broader date range or clear the active filters."
              : "Account and research activity will appear here as it happens."
          }
          title={
            from || to || read !== "ALL"
              ? "No matching notifications"
              : "No notifications yet"
          }
          variant={from || to || read !== "ALL" ? "filtered" : "empty"}
        />
      )}
    </div>
  );
}
