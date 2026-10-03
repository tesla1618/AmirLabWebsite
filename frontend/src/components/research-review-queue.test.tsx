import "@testing-library/jest-dom/vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ResearchReviewQueue } from "./research-review-queue";
import { ApiRequestError, apiRequest } from "@/lib/client-api";
import type { ResearchLiveEvent } from "@/lib/research-live-events";

const mocks = vi.hoisted(() => ({
  refreshVersion: 0,
  select: vi.fn(),
  subscribe: vi.fn(),
  showToast: vi.fn(),
}));
vi.mock("@/components/auth-provider", () => ({
  useAuth: () => ({ user: { id: "reviewer", role: "MODERATOR" } }),
}));
vi.mock("@/components/notification-provider", () => ({
  useNotifications: () => ({
    researchRefreshVersion: mocks.refreshVersion,
    subscribeResearchEvents: mocks.subscribe,
    showToast: mocks.showToast,
    refreshUnreadCount: async () => {},
  }),
}));
vi.mock("@/lib/use-review-selection", () => ({
  useReviewSelection: () => ({ selectedId: "record", select: mocks.select }),
}));
vi.mock("@/lib/client-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/client-api")>()),
  apiRequest: vi.fn(),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it.each(["event", "reconnect", "reconnect-excluded"])(
  "keeps the editor's original revision and draft after %s refresh and a conflict",
  async (trigger) => {
    let onEvent: ((event: ResearchLiveEvent) => void) | undefined;
    mocks.subscribe.mockImplementation((callback: typeof onEvent) => {
      onEvent = callback;
      return () => {};
    });
    let record = {
      id: "record",
      title: "Original title",
      type: "PAPER",
      summary: null,
      canonicalUrl: "https://example.org/paper",
      legacyUrl: null,
      automationVersion: 1,
      automationState: "SUCCEEDED",
      reviewStatus: "NEEDS_REVIEW",
      paper: null,
      dataset: null,
      submittedById: "member",
      sourceSnapshot: {
        status: "FETCHED",
        failureReason: null,
        fetchedAt: null,
        metadata: null,
      },
      contributors: [
        {
          displayName: "Source author",
          sortOrder: 0,
          person: null,
          matches: [],
        },
      ],
      submittedBy: {
        email: "owner@example.test",
        person: { id: "owner", fullName: "Owner" },
      },
    };
    const request = vi.mocked(apiRequest);
    request.mockImplementation(async (path, init) => {
      if (init.method === "PATCH")
        throw new ApiRequestError(
          "Research changed; refresh before retrying.",
          409,
        );
      if (path === "/research-connections/people") return [];
      if (path === "/research/submitters")
        return [{ id: "owner", fullName: "Owner" }];
      if (path === "/research-review/record") {
        if (trigger === "reconnect-excluded" && record.automationVersion === 2)
          await new Promise((resolve) => setTimeout(resolve, 600));
        return record;
      }
      return {
        items:
          trigger === "reconnect-excluded" && record.automationVersion === 2
            ? []
            : [record],
        total: 1,
        totalPages: 1,
        page: 1,
        pageSize: 10,
      };
    });
    mocks.refreshVersion = 0;
    const view = render(<ResearchReviewQueue />);
    const edit = await screen.findByRole("button", { name: "Edit record" });
    await waitFor(() => expect(edit).toBeEnabled());
    fireEvent.click(edit);
    const title = screen.getByLabelText("Title");
    fireEvent.change(title, { target: { value: "My unsaved title" } });
    record = { ...record, title: "New server title", automationVersion: 2 };
    if (trigger.startsWith("reconnect")) {
      mocks.refreshVersion++;
      view.rerender(<ResearchReviewQueue />);
    } else
      act(() =>
        onEvent?.({
          kind: "source",
          scope: "research",
          researchItemId: "record",
          sourceStatus: "FETCHED",
        }),
      );
    await screen.findByRole("heading", { name: "New server title" });
    expect(screen.getByLabelText("Title")).toHaveValue("My unsaved title");
    const form = title.closest("form");
    if (!form) throw new Error("Editor form not found");
    fireEvent.submit(form);
    await waitFor(() =>
      expect(mocks.showToast).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Research record was not updated" }),
      ),
    );
    const patch = request.mock.calls.find(
      ([, init]) => init.method === "PATCH",
    );
    if (typeof patch?.[1].body !== "string")
      throw new Error("Edit request not sent");
    expect(JSON.parse(patch[1].body)).toMatchObject({
      title: "My unsaved title",
      expectedAutomationVersion: 1,
    });
    expect(screen.getByLabelText("Title")).toHaveValue("My unsaved title");
  },
);
