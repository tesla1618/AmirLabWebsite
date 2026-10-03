import "@testing-library/jest-dom/vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SiteHeader } from "./site-header";

const mocks = vi.hoisted(() => ({
  logout: vi.fn(async () => {}),
  signedIn: true,
}));
vi.mock("next/navigation", () => ({ usePathname: () => "/" }));
vi.mock("@/components/auth-provider", () => ({
  useAuth: () => ({
    loading: false,
    logout: mocks.logout,
    user: mocks.signedIn
      ? {
          id: "admin",
          email: "admin@example.test",
          role: "ADMIN",
          status: "ACTIVE",
          person: { id: "person", fullName: "Administrator", avatar: null },
        }
      : null,
  }),
}));
vi.mock("@/components/notification-provider", () => ({
  useNotifications: () => ({ loading: false, unreadCount: 6 }),
}));

beforeEach(() => {
  mocks.signedIn = true;
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
    configurable: true,
    value: function () {
      this.setAttribute("open", "");
    },
  });
  Object.defineProperty(HTMLDialogElement.prototype, "close", {
    configurable: true,
    value: function () {
      this.removeAttribute("open");
    },
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  mocks.logout.mockClear();
});

describe("public account logout", () => {
  it("signs out through the desktop account menu", async () => {
    render(<SiteHeader />);
    fireEvent.keyDown(
      screen.getByRole("button", {
        name: "Account menu, 6 unread notifications",
      }),
      { key: "ArrowDown" },
    );
    const logout = await screen.findByRole("menuitem", { name: "Log out" });
    await act(async () => fireEvent.click(logout));
    expect(mocks.logout).toHaveBeenCalledOnce();
  });

  it("signs out and closes the public mobile menu", async () => {
    render(<SiteHeader />);
    fireEvent.click(
      screen.getByRole("button", { name: "Open menu, 6 unread notifications" }),
    );
    const dialog = screen.getByRole("dialog", { name: "Site menu" });
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: "Log out" })),
    );
    expect(mocks.logout).toHaveBeenCalledOnce();
    expect(dialog).not.toHaveAttribute("open");
  });

  it("does not offer logout to signed-out visitors", () => {
    mocks.signedIn = false;
    render(<SiteHeader />);
    fireEvent.click(screen.getByRole("button", { name: "Open menu" }));
    expect(screen.queryByRole("button", { name: "Log out" })).toBeNull();
    expect(
      screen.getAllByRole("link", { name: "Log in" }).length,
    ).toBeGreaterThan(0);
  });
});
