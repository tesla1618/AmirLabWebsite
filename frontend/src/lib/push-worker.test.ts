import { readFileSync } from "node:fs";
import vm from "node:vm";
import { expect, it, vi } from "vitest";

function worker() {
  const handlers: Record<string, (event: unknown) => void> = {};
  const cache = {
    addAll: vi.fn(),
    match: vi.fn().mockResolvedValue("offline"),
  };
  const openWindow = vi.fn();
  const scope = {
    location: { origin: "https://lab.test" },
    addEventListener: (name: string, handler: (event: unknown) => void) => {
      handlers[name] = handler;
    },
    registration: { showNotification: vi.fn() },
    clients: { claim: vi.fn(), openWindow },
    skipWaiting: vi.fn(),
  };
  const fetch = vi.fn().mockRejectedValue(new Error("offline"));
  vm.runInNewContext(readFileSync("public/push-worker.js", "utf8"), {
    self: scope,
    clients: scope.clients,
    caches: {
      open: vi.fn().mockResolvedValue(cache),
      keys: vi.fn().mockResolvedValue([]),
      delete: vi.fn(),
    },
    fetch,
    URL,
  });
  return { handlers, cache, fetch, openWindow };
}
it("falls back offline for navigation without caching private responses", async () => {
  const { handlers, cache } = worker();
  let response: Promise<unknown> | undefined;
  handlers.fetch?.({
    request: {
      mode: "navigate",
      method: "GET",
      url: "https://lab.test/workspace",
    },
    respondWith: (value: Promise<unknown>) => {
      response = value;
    },
  });
  expect(await response).toBe("offline");
  expect(cache.match).toHaveBeenCalledWith("/offline.html");
});
it("does not intercept API, RSC or mutations", () => {
  const { handlers } = worker();
  for (const request of [
    { mode: "cors", method: "GET", url: "https://lab.test/api/auth/me" },
    { mode: "cors", method: "GET", url: "https://lab.test/workspace?_rsc=1" },
    { mode: "navigate", method: "POST", url: "https://lab.test/workspace" },
  ]) {
    const respondWith = vi.fn();
    handlers.fetch?.({ request, respondWith });
    expect(respondWith).not.toHaveBeenCalled();
  }
});
it("restricts notification destinations to same-origin workspace paths", async () => {
  const { handlers, openWindow } = worker();
  for (const url of [
    "https://evil.test/workspace",
    "/login",
    "/workspaceevil",
    "javascript:alert(1)",
  ]) {
    let task: Promise<unknown> | undefined;
    handlers.notificationclick({
      notification: { close: vi.fn(), data: { url } },
      waitUntil: (value: Promise<unknown>) => {
        task = value;
      },
    });
    await task;
    expect(openWindow).toHaveBeenLastCalledWith("/workspace");
  }
});
it("serves only approved cached static assets offline", async () => {
  const { handlers, cache } = worker();
  let response: Promise<unknown> | undefined;
  handlers.fetch({
    request: {
      mode: "cors",
      method: "GET",
      url: "https://lab.test/icon-192.png",
    },
    respondWith: (value: Promise<unknown>) => {
      response = value;
    },
  });
  expect(await response).toBe("offline");
  expect(cache.match).toHaveBeenCalledWith("/icon-192.png");
});
