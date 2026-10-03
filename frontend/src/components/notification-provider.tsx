"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { API_URL } from "@/lib/api";
import { apiRequest } from "@/lib/client-api";
import type { NotificationRecord } from "@/lib/types";
import {
  parseResearchLiveEvent,
  type ResearchLiveEvent,
} from "@/lib/research-live-events";

interface NotificationState {
  loading: boolean;
  researchRefreshVersion: number;
  queueCounts: WorkspaceQueueCounts;
  unreadCount: number;
  markOneRead: () => void;
  refreshUnreadCount: () => Promise<void>;
  showToast: (toast: {
    body: string;
    title: string;
    tone?: "error" | "success";
  }) => void;
  subscribeResearchEvents: (
    listener: (event: ResearchLiveEvent) => void,
  ) => () => void;
}

export interface WorkspaceQueueCounts {
  applications: number;
  profileReviews: number;
  projectReviews: number;
  researchReviews: number;
  weeklyReportReviews: number;
}

interface WorkspaceCounts extends WorkspaceQueueCounts {
  unreadCount: number;
}

const EMPTY_QUEUE_COUNTS: WorkspaceQueueCounts = {
  applications: 0,
  profileReviews: 0,
  projectReviews: 0,
  researchReviews: 0,
  weeklyReportReviews: 0,
};

const NotificationContext = createContext<NotificationState | null>(null);

function fetchWorkspaceCounts() {
  return apiRequest<WorkspaceCounts>("/notifications/count", {
    method: "GET",
  });
}

export function NotificationProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { loading: authLoading, user } = useAuth();
  const [researchRefreshVersion, setResearchRefreshVersion] = useState(0);
  const [unreadCount, setUnreadCount] = useState(0);
  const [queueCounts, setQueueCounts] = useState(EMPTY_QUEUE_COUNTS);
  const [loadedUserId, setLoadedUserId] = useState<string>();
  const [toasts, setToasts] = useState<NotificationRecord[]>([]);
  const researchEventListeners = useRef(
    new Set<(event: ResearchLiveEvent) => void>(),
  );

  const subscribeResearchEvents = useCallback(
    (listener: (event: ResearchLiveEvent) => void) => {
      researchEventListeners.current.add(listener);
      return () => researchEventListeners.current.delete(listener);
    },
    [],
  );

  const showToast = useCallback(
    ({
      body,
      title,
      tone = "success",
    }: {
      body: string;
      title: string;
      tone?: "error" | "success";
    }) => {
      const toast: NotificationRecord = {
        actionUrl: null,
        body,
        createdAt: new Date().toISOString(),
        id: `local-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        readAt: null,
        title,
        type: tone.toUpperCase(),
      };
      setToasts((current) => [toast, ...current].slice(0, 3));
      window.setTimeout(() => {
        setToasts((current) => current.filter(({ id }) => id !== toast.id));
      }, 7000);
    },
    [],
  );

  const refreshUnreadCount = useCallback(async () => {
    if (!user) {
      return;
    }
    const result = await fetchWorkspaceCounts();
    setUnreadCount(result.unreadCount);
    setQueueCounts({
      applications: result.applications,
      profileReviews: result.profileReviews,
      projectReviews: result.projectReviews,
      researchReviews: result.researchReviews,
      weeklyReportReviews: result.weeklyReportReviews,
    });
  }, [user]);

  const openToast = useCallback(
    async (notification: NotificationRecord) => {
      if (!notification.actionUrl) return;
      setToasts((current) =>
        current.filter(({ id }) => id !== notification.id),
      );
      try {
        if (!notification.readAt && !notification.id.startsWith("local-")) {
          const response = await apiRequest<{ updated: boolean }>(
            `/notifications/${notification.id}/read`,
            { method: "PATCH" },
          );
          if (response.updated) {
            setUnreadCount((current) => Math.max(0, current - 1));
          }
        }
        await refreshUnreadCount();
      } catch {
        void refreshUnreadCount().catch(() => undefined);
      } finally {
        router.push(notification.actionUrl);
      }
    },
    [refreshUnreadCount, router],
  );

  useEffect(() => {
    if (authLoading || !user) return;

    let active = true;
    void fetchWorkspaceCounts()
      .then((result) => {
        if (!active) return;
        setUnreadCount(result.unreadCount);
        setQueueCounts({
          applications: result.applications,
          profileReviews: result.profileReviews,
          projectReviews: result.projectReviews,
          researchReviews: result.researchReviews,
          weeklyReportReviews: result.weeklyReportReviews,
        });
      })
      .catch(() => {
        if (active) {
          setUnreadCount(0);
          setQueueCounts(EMPTY_QUEUE_COUNTS);
        }
      })
      .finally(() => {
        if (active) setLoadedUserId(user.id);
      });

    const events = new EventSource(`${API_URL}/notifications/events`, {
      withCredentials: true,
    });
    const researchEventListener = (event: Event) => {
      if (!("data" in event) || typeof event.data !== "string") return;
      let researchEvent: ResearchLiveEvent | null;
      try {
        researchEvent = parseResearchLiveEvent(JSON.parse(event.data));
      } catch {
        return;
      }
      if (!researchEvent) return;
      for (const listener of researchEventListeners.current) {
        listener(researchEvent);
      }
    };
    events.addEventListener("research", researchEventListener);
    events.onmessage = (event) => {
      if (!active) return;
      try {
        const notification = JSON.parse(event.data) as NotificationRecord;
        setUnreadCount((current) => current + 1);
        void refreshUnreadCount().catch(() => undefined);
        setToasts((current) =>
          [
            notification,
            ...current.filter(({ id }) => id !== notification.id),
          ].slice(0, 3),
        );
        window.setTimeout(() => {
          setToasts((current) =>
            current.filter(({ id }) => id !== notification.id),
          );
        }, 7000);
      } catch {
        void refreshUnreadCount().catch(() => undefined);
      }
    };
    const reconcile = () => {
      if (document.visibilityState === "visible") {
        void refreshUnreadCount().catch(() => undefined);
        setResearchRefreshVersion((current) => current + 1);
      }
    };
    // SSE has no replay; reconcile server state after every connection.
    events.onopen = reconcile;
    window.addEventListener("focus", reconcile);
    document.addEventListener("visibilitychange", reconcile);
    return () => {
      active = false;
      events.removeEventListener("research", researchEventListener);
      events.onopen = null;
      events.close();
      window.removeEventListener("focus", reconcile);
      document.removeEventListener("visibilitychange", reconcile);
    };
  }, [authLoading, refreshUnreadCount, user]);

  return (
    <NotificationContext.Provider
      value={{
        loading: authLoading || Boolean(user && loadedUserId !== user.id),
        researchRefreshVersion,
        markOneRead: () =>
          setUnreadCount((current) => Math.max(0, current - 1)),
        queueCounts: user ? queueCounts : EMPTY_QUEUE_COUNTS,
        refreshUnreadCount,
        showToast,
        subscribeResearchEvents,
        unreadCount: user ? unreadCount : 0,
      }}
    >
      {children}
      <div
        aria-live="polite"
        aria-relevant="additions"
        className="pointer-events-none fixed bottom-4 right-4 z-[90] grid w-[min(360px,calc(100vw-2rem))] gap-[.65rem]"
      >
        {toasts.map((notification) => (
          <article
            className="pointer-events-auto grid grid-cols-[8px_minmax(0,1fr)_28px] items-start gap-[.7rem] rounded-panel bg-ink py-[.9rem] pl-4 pr-[.8rem] text-[var(--toast-ink)] shadow-[0_20px_55px_color-mix(in_srgb,var(--ink)_28%,transparent)] animate-[toast-enter_260ms_ease-out_both] motion-reduce:animate-none"
            key={notification.id}
          >
            <span
              className={`mt-[.3rem] h-2 w-2 rounded-full ${notification.type === "ERROR" ? "bg-danger" : notification.type === "SUCCESS" || notification.type === "RESEARCH_REVIEWED" ? "bg-success" : "bg-gold animate-[status-pulse_2s_infinite] motion-reduce:animate-none"}`}
            />
            <div>
              {notification.actionUrl ? (
                <button
                  className="inline h-auto w-auto cursor-pointer border-0 bg-transparent p-0 text-left text-[.82rem] font-[750] text-[var(--toast-ink)] hover:text-dark-accent"
                  onClick={() => void openToast(notification)}
                  type="button"
                >
                  {notification.title}
                </button>
              ) : (
                <strong className="text-[.82rem] font-bold">
                  {notification.title}
                </strong>
              )}
              <p className="mt-[.22rem] text-[.74rem] leading-[1.5] text-[var(--toast-muted)]">
                {notification.body}
              </p>
            </div>
            <button
              aria-label="Dismiss notification"
              className="flex h-7 w-7 cursor-pointer items-center justify-center border-0 bg-transparent p-0 text-[var(--toast-muted)]"
              onClick={() =>
                setToasts((current) =>
                  current.filter(({ id }) => id !== notification.id),
                )
              }
              type="button"
            >
              <X aria-hidden="true" size={15} />
            </button>
          </article>
        ))}
      </div>
    </NotificationContext.Provider>
  );
}

export function useNotifications(): NotificationState {
  const notifications = useContext(NotificationContext);
  if (!notifications) {
    throw new Error(
      "useNotifications must be used inside NotificationProvider",
    );
  }
  return notifications;
}
