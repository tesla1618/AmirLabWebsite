import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiRequestError, apiRequest } from "@/lib/client-api";
import { AuthProvider, useAuth } from "./auth-provider";
import { GuestOnly } from "./guest-only";
import { LoginForm } from "./login-form";

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn() }) }));

vi.mock("@/lib/client-api", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/client-api")>();
  return { ...original, apiRequest: vi.fn() };
});

const request = vi.mocked(apiRequest);

function AuthState() {
  const { loading, user } = useAuth();
  return <p>{loading ? "loading" : (user?.email ?? "guest")}</p>;
}

describe("AuthProvider", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    request.mockReset();
    sessionStorage.clear();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("shows the session notice when an expired returning visitor opens login", async () => {
    sessionStorage.setItem("amirl_csrf", "previous-session");
    request.mockRejectedValueOnce(new ApiRequestError("Session expired", 401));
    render(
      <AuthProvider>
        <GuestOnly>
          <LoginForm />
        </GuestOnly>
      </AuthProvider>,
    );
    await act(async () => Promise.resolve());
    expect(
      screen.getByText("Your session ended. Please log in again."),
    ).toBeTruthy();
  });

  it("clears loading and keeps retrying until a temporarily unavailable API is ready", async () => {
    request
      .mockRejectedValueOnce(
        new ApiRequestError("Unable to reach the server", 0),
      )
      .mockRejectedValueOnce(
        new ApiRequestError("Unable to reach the server", 0),
      )
      .mockRejectedValueOnce(
        new ApiRequestError("Unable to reach the server", 0),
      )
      .mockRejectedValueOnce(
        new ApiRequestError("Unable to reach the server", 0),
      )
      .mockResolvedValue({
        csrfToken: "csrf",
        user: { email: "admin@amirl.org" },
      });

    render(
      <AuthProvider>
        <AuthState />
      </AuthProvider>,
    );

    await act(async () => vi.advanceTimersByTimeAsync(7_000));
    expect(screen.getByText("guest")).toBeTruthy();

    await act(async () => vi.advanceTimersByTimeAsync(8_000));
    expect(screen.getByText("admin@amirl.org")).toBeTruthy();
    expect(request).toHaveBeenCalledTimes(5);
  });

  it("clears a remotely revoked session on the session-invalid event", async () => {
    request.mockResolvedValueOnce({
      csrfToken: "csrf",
      user: { email: "admin@amirl.org" },
    });
    render(
      <AuthProvider>
        <AuthState />
      </AuthProvider>,
    );
    await act(async () => Promise.resolve());
    expect(screen.getByText("admin@amirl.org")).toBeTruthy();
    sessionStorage.setItem("amirl_csrf", "csrf");
    await act(async () =>
      window.dispatchEvent(new Event("amirl:session-invalid")),
    );
    expect(screen.getByText("guest")).toBeTruthy();
    expect(sessionStorage.getItem("amirl_csrf")).toBeNull();
    expect(sessionStorage.getItem("amirl_session_ended")).toBe("1");
  });

  it("stops checking when the API confirms the session is unauthorized", async () => {
    request.mockRejectedValue(
      new ApiRequestError("Authentication is required", 401),
    );

    render(
      <AuthProvider>
        <AuthState />
      </AuthProvider>,
    );

    await act(async () => Promise.resolve());
    expect(screen.getByText("guest")).toBeTruthy();
    expect(request).toHaveBeenCalledTimes(1);
  });
});
