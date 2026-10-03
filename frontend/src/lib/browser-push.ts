"use client";
import { ApiRequestError, apiRequest } from "@/lib/client-api";
export function pushSupported() {
  return (
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}
export async function enableBrowserPush() {
  if (!pushSupported())
    throw new Error(
      "This browser does not support push. On iPhone or iPad, add AmirLab to your Home Screen first.",
    );
  // Ask during the user's click, before network requests can lose user activation.
  if ((await Notification.requestPermission()) !== "granted")
    throw new Error(
      "Notifications are blocked. Allow them in your browser settings and try again.",
    );
  const { publicKey } = await apiRequest<{ publicKey: string | null }>(
    "/collaboration/push/public-key",
    { method: "GET" },
  );
  if (!publicKey)
    throw new Error(
      "Push notifications are not configured yet. Try again later.",
    );
  const registered = await navigator.serviceWorker.getRegistration("/");
  if (!registered)
    throw new Error("The app worker is unavailable. Reload and try again.");
  const registration = await navigator.serviceWorker.ready;
  const binary = atob(publicKey.replace(/-/g, "+").replace(/_/g, "/"));
  const key = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  const existing = await registration.pushManager.getSubscription();
  const subscription =
    existing ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: key,
    }));
  try {
    await apiRequest("/collaboration/push/subscription", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        endpoint: subscription.toJSON().endpoint,
        keys: subscription.toJSON().keys,
      }),
    });
  } catch (error) {
    if (!existing) await subscription.unsubscribe();
    if (existing && error instanceof ApiRequestError && error.status === 409)
      throw new Error(
        "This browser is linked to another account. Disable notifications, then enable them again for this account.",
      );
    throw error;
  }
  return subscription;
}
export async function disableBrowserPush(subscription: PushSubscription) {
  await apiRequest("/collaboration/push/subscription", {
    method: "DELETE",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ endpoint: subscription.endpoint }),
  });
  if (!(await subscription.unsubscribe()))
    throw new Error(
      "Push was disabled on the server. Retry to remove the browser subscription.",
    );
}
