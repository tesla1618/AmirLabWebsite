import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { apiRequest } from "@/lib/client-api";
import { AccountSettings } from "./account-settings";
vi.mock("@/lib/client-api", () => ({ apiRequest: vi.fn() }));
const pwa = vi.hoisted(() => ({
  registration: null as {
    pushManager: { getSubscription: () => Promise<{ endpoint: string }> };
  } | null,
}));
vi.mock("@/components/pwa-provider", () => ({
  usePwa: () => ({
    registration: pwa.registration,
    install: null,
    unavailable: false,
  }),
}));
afterEach(() => {
  pwa.registration = null;
  vi.unstubAllGlobals();
  cleanup();
  vi.clearAllMocks();
});
const sessions = [
  {
    id: "current",
    current: true,
    userAgent: "Chrome",
    ipAddress: "127.0.0.1",
    createdAt: "2026-10-03",
    lastSeenAt: "2026-10-03",
    expiresAt: "2026-11-03",
  },
  {
    id: "other",
    current: false,
    userAgent: "Firefox",
    ipAddress: null,
    createdAt: "2026-10-03",
    lastSeenAt: "2026-10-03",
    expiresAt: "2026-11-03",
  },
];
it("keeps the current session and revokes another session", async () => {
  vi.mocked(apiRequest)
    .mockResolvedValueOnce(sessions)
    .mockResolvedValueOnce({ revoked: true });
  render(<AccountSettings />);
  await screen.findByText("This session");
  expect(screen.getAllByRole("button", { name: "Sign out" })).toHaveLength(1);
  fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
  await waitFor(() =>
    expect(screen.queryByText("Firefox · Unknown device")).toBeNull(),
  );
  expect(apiRequest).toHaveBeenCalledWith("/auth/sessions/other", {
    method: "DELETE",
  });
});
it("preserves a failed session row and shows an actionable error", async () => {
  vi.mocked(apiRequest)
    .mockResolvedValueOnce(sessions)
    .mockRejectedValueOnce(new Error("internal"));
  render(<AccountSettings />);
  await screen.findByText("This session");
  fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
  await screen.findByText("Could not sign out this device. Try again.");
  expect(screen.getByText("Firefox · Unknown device")).toBeTruthy();
});
it("signs out all other sessions while keeping this session", async () => {
  vi.mocked(apiRequest)
    .mockResolvedValueOnce(sessions)
    .mockResolvedValueOnce({ revoked: 1 });
  render(<AccountSettings />);
  await screen.findByText("This session");
  fireEvent.click(
    screen.getByRole("button", { name: "Sign out other devices" }),
  );
  await waitFor(() =>
    expect(screen.queryByText("Firefox · Unknown device")).toBeNull(),
  );
  expect(screen.getByText("This session")).toBeTruthy();
  expect(apiRequest).toHaveBeenCalledWith("/auth/sessions/logout-others", {
    method: "POST",
  });
});
it("explains how to link an unbound browser subscription when no test is queued", async () => {
  vi.stubGlobal("PushManager", class {});
  vi.stubGlobal("Notification", { permission: "granted" });
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: {},
  });
  pwa.registration = {
    pushManager: {
      getSubscription: vi
        .fn()
        .mockResolvedValue({ endpoint: "https://push.test" }),
    },
  };
  vi.mocked(apiRequest)
    .mockResolvedValueOnce(sessions)
    .mockResolvedValueOnce({ queued: 0 });
  render(<AccountSettings />);
  await screen.findByText(
    "This browser has a push subscription. Enable again to link it to this session.",
  );
  fireEvent.click(screen.getByRole("button", { name: "Send test" }));
  await screen.findByText(
    "No notification was sent. Enable notifications to link this browser to your current session, then try again.",
  );
});
