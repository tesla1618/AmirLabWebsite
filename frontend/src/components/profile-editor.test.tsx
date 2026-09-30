import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProfileEditor } from "./profile-editor";
import { useAuth } from "@/components/auth-provider";
import { useNotifications } from "@/components/notification-provider";
import { apiRequest } from "@/lib/client-api";
import type { MyProfile } from "@/lib/types";

vi.mock("@/components/auth-provider", () => ({
  useAuth: vi.fn(),
}));

vi.mock("@/components/notification-provider", () => ({
  useNotifications: vi.fn(),
}));

vi.mock("@/lib/client-api", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/client-api")>();
  return { ...original, apiRequest: vi.fn() };
});

const auth = vi.mocked(useAuth);
const notifications = vi.mocked(useNotifications);
const request = vi.mocked(apiRequest);

function profile(role: MyProfile["accountRole"]): MyProfile {
  return {
    accountRole: role,
    draft: null,
    profile: {
      biography: null,
      contactAddress: "AMIRLab, Kigali",
      email: null,
      expertise: [],
      fullName: "Staff Member",
      headline: null,
      id: "person-1",
      isAlumni: false,
      links: [],
      phone: "+250 700 000 000",
      rank: null,
      roleTitle: "Operations Lead",
      slug: "staff-member",
      avatar: null,
      profileSections: [],
    },
  };
}

describe("ProfileEditor staff profiles", () => {
  beforeEach(() => {
    auth.mockReturnValue({
      loading: false,
      logout: vi.fn(async () => {}),
      refreshUser: vi.fn(async () => null),
      user: {
        email: "staff@amirlab.org",
        id: "user-1",
        person: null,
        role: "MODERATOR",
        status: "ACTIVE",
      },
    });
    notifications.mockReturnValue({
      loading: false,
      markOneRead: vi.fn(),
      queueCounts: {
        applications: 0,
        profileReviews: 0,
        projectReviews: 0,
        researchReviews: 0,
        weeklyReportReviews: 0,
      },
      refreshUnreadCount: vi.fn(async () => {}),
      showToast: vi.fn(),
      unreadCount: 0,
    });
    request.mockReset();
    request.mockResolvedValue(profile("MODERATOR"));
  });

  afterEach(() => {
    cleanup();
  });

  it("keeps managed account email and role control for an admin", async () => {
    auth.mockReturnValue({
      loading: false,
      logout: vi.fn(async () => {}),
      refreshUser: vi.fn(async () => null),
      user: {
        email: "admin@amirlab.org",
        id: "admin-1",
        person: null,
        role: "ADMIN",
        status: "ACTIVE",
      },
    });
    request.mockImplementation(async (path) =>
      path.endsWith("/profile")
        ? profile("MODERATOR")
        : {
            email: "moderator@amirlab.org",
            person: { fullName: "Staff Member", rank: "RESEARCHER" },
            role: "MODERATOR",
          },
    );

    render(<ProfileEditor userId="user-1" />);

    await waitFor(() =>
      expect(
        (screen.getByLabelText("Email") as HTMLInputElement).value,
      ).toBe("moderator@amirlab.org"),
    );
    expect(screen.getByLabelText("Permission role")).toBeTruthy();
  });

  it.each(["MODERATOR", "ADMIN"] as const)(
    "renders shared staff fields without research controls for %s",
    async (role) => {
      auth.mockReturnValue({
        loading: false,
        logout: vi.fn(async () => {}),
        refreshUser: vi.fn(async () => null),
        user: {
          email: "staff@amirlab.org",
          id: "user-1",
          person: null,
          role,
          status: "ACTIVE",
        },
      });
      request.mockResolvedValue(profile(role));

      render(<ProfileEditor />);

      await waitFor(() =>
        expect(
          (screen.getByLabelText("Full name") as HTMLInputElement).value,
        ).toBe("Staff Member"),
      );
      expect(
        (screen.getByLabelText("Staff title") as HTMLInputElement).value,
      ).toBe("Operations Lead");
      expect(
        (screen.getByLabelText("Phone") as HTMLInputElement).value,
      ).toBe("+250 700 000 000");
      expect(
        (screen.getByLabelText("Contact address") as HTMLTextAreaElement).value,
      ).toBe("AMIRLab, Kigali");
      expect(screen.getByLabelText("Profile image")).toBeTruthy();
      expect(screen.queryByLabelText("Headline")).toBeNull();
      expect(screen.queryByLabelText("Biography")).toBeNull();
      expect(screen.queryByLabelText("Expertise")).toBeNull();
      expect(screen.queryByText("Profile links")).toBeNull();
      expect(screen.queryByText("Profile sections")).toBeNull();
      expect(screen.queryByText("Research rank")).toBeNull();
      expect(screen.queryByText("Live preview")).toBeNull();
      expect(screen.queryByText("Completeness")).toBeNull();
    },
  );
});
