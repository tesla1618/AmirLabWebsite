import { afterEach, describe, expect, it, vi } from "vitest";

const originalApiUrl = process.env.NEXT_PUBLIC_API_URL;

afterEach(() => {
  if (originalApiUrl === undefined) {
    delete process.env.NEXT_PUBLIC_API_URL;
  } else {
    process.env.NEXT_PUBLIC_API_URL = originalApiUrl;
  }
  vi.resetModules();
});

describe("Next.js image configuration", () => {
  it("allows assets served by the configured API", async () => {
    process.env.NEXT_PUBLIC_API_URL = "https://api.example.test:8443/v1/api/";
    vi.resetModules();

    const { default: config } = await import("../next.config");

    expect(config.images?.remotePatterns).toEqual([
      {
        protocol: "https",
        hostname: "api.example.test",
        port: "8443",
        pathname: "/v1/api/assets/**",
      },
    ]);
  });
});
