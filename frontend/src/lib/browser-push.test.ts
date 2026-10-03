import { afterEach, expect, it, vi } from "vitest";
import { apiRequest } from "./client-api";
import { disableBrowserPush, enableBrowserPush } from "./browser-push";
vi.mock("./client-api", async (original) => ({
  ...(await original<typeof import("./client-api")>()),
  apiRequest: vi.fn(),
}));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.mocked(apiRequest).mockReset();
});
it("requests permission before contacting the server and rejects denial", async () => {
  vi.stubGlobal("PushManager", class {});
  vi.stubGlobal("Notification", {
    requestPermission: vi.fn().mockResolvedValue("denied"),
  });
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: {},
  });
  await expect(enableBrowserPush()).rejects.toThrow(
    "Notifications are blocked",
  );
  expect(apiRequest).not.toHaveBeenCalled();
});
it("removes a new local subscription when server registration fails", async () => {
  const unsubscribe = vi.fn().mockResolvedValue(true);
  vi.stubGlobal("PushManager", class {});
  vi.stubGlobal("Notification", {
    requestPermission: vi.fn().mockResolvedValue("granted"),
  });
  const worker = {
    pushManager: {
      getSubscription: vi.fn().mockResolvedValue(null),
      subscribe: vi.fn().mockResolvedValue({
        unsubscribe,
        toJSON: () => ({ endpoint: "https://push.test" }),
      }),
    },
  };
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: {
      ready: Promise.resolve(worker),
      getRegistration: vi.fn().mockResolvedValue(worker),
    },
  });
  vi.mocked(apiRequest)
    .mockResolvedValueOnce({ publicKey: "YQ" })
    .mockRejectedValueOnce(new Error("Unavailable"));
  await expect(enableBrowserPush()).rejects.toThrow("Unavailable");
  expect(unsubscribe).toHaveBeenCalledTimes(1);
});
it("keeps the browser subscription when server removal fails", async () => {
  const unsubscribe = vi.fn().mockResolvedValue(true);
  const subscription: PushSubscription = {
    endpoint: "https://push.test",
    unsubscribe,
    expirationTime: null,
    options: { userVisibleOnly: true, applicationServerKey: null },
    getKey: () => null,
    toJSON: () => ({ endpoint: "https://push.test" }),
  };
  vi.mocked(apiRequest).mockRejectedValue(new Error("Unavailable"));
  await expect(disableBrowserPush(subscription)).rejects.toThrow("Unavailable");
  expect(unsubscribe).not.toHaveBeenCalled();
});
it("sends only endpoint and keys accepted by the strict backend DTO", async () => {
  vi.stubGlobal("PushManager", class {});
  vi.stubGlobal("Notification", {
    requestPermission: vi.fn().mockResolvedValue("granted"),
  });
  const json = {
    endpoint: "https://push.test",
    expirationTime: null,
    keys: { p256dh: "key", auth: "auth" },
  };
  const worker = {
    pushManager: {
      getSubscription: vi.fn().mockResolvedValue({ toJSON: () => json }),
    },
  };
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: {
      ready: Promise.resolve(worker),
      getRegistration: vi.fn().mockResolvedValue(worker),
    },
  });
  vi.mocked(apiRequest)
    .mockResolvedValueOnce({ publicKey: "YQ" })
    .mockResolvedValueOnce({});
  await enableBrowserPush();
  expect(apiRequest).toHaveBeenLastCalledWith(
    "/collaboration/push/subscription",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys }),
    },
  );
});
it("explains how to replace a subscription retained from another account", async () => {
  const { ApiRequestError } = await import("./client-api");
  vi.stubGlobal("PushManager", class {});
  vi.stubGlobal("Notification", {
    requestPermission: vi.fn().mockResolvedValue("granted"),
  });
  const worker = {
    pushManager: {
      getSubscription: vi
        .fn()
        .mockResolvedValue({
          toJSON: () => ({
            endpoint: "https://push.test",
            keys: { auth: "auth", p256dh: "key" },
          }),
        }),
    },
  };
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: {
      ready: Promise.resolve(worker),
      getRegistration: vi.fn().mockResolvedValue(worker),
    },
  });
  vi.mocked(apiRequest)
    .mockResolvedValueOnce({ publicKey: "YQ" })
    .mockRejectedValueOnce(new ApiRequestError("Another account", 409));
  await expect(enableBrowserPush()).rejects.toThrow(
    "This browser is linked to another account. Disable notifications, then enable them again for this account.",
  );
});
