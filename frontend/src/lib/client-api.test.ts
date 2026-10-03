import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiRequest } from "./client-api";

describe("API session invalidation", () => {
  beforeEach(() => sessionStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it.each(["/auth/password", "/auth/email-change/verify"])(
    "preserves authentication for a credential validation failure at %s",
    async (path) => {
      const invalidated = vi.fn();
      window.addEventListener("amirl:session-invalid", invalidated);
      vi.stubGlobal(
        "fetch",
        vi
          .fn()
          .mockResolvedValue(
            new Response(
              JSON.stringify({
                code: "HTTP_401",
                message: "Incorrect credentials",
              }),
              { status: 401 },
            ),
          ),
      );
      try {
        await expect(
          apiRequest(path, { method: "POST" }),
        ).rejects.toMatchObject({ status: 401 });
        expect(invalidated).not.toHaveBeenCalled();
      } finally {
        window.removeEventListener("amirl:session-invalid", invalidated);
        vi.unstubAllGlobals();
      }
    },
  );

  it("invalidates authentication when the server identifies an ended session", async () => {
    const invalidated = vi.fn();
    window.addEventListener("amirl:session-invalid", invalidated);
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ code: "SESSION_INVALID" }), {
            status: 401,
          }),
        ),
    );
    try {
      await expect(
        apiRequest("/auth/sessions", { method: "GET" }),
      ).rejects.toMatchObject({ status: 401 });
      expect(invalidated).toHaveBeenCalledTimes(1);
    } finally {
      window.removeEventListener("amirl:session-invalid", invalidated);
      vi.unstubAllGlobals();
    }
  });
});
