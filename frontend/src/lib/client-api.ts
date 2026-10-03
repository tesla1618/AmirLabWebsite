"use client";

import { API_URL } from "./api";
import type { ReviewIssue } from "./review-issues";

export class ApiRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
    readonly issues: ReviewIssue[] = [],
  ) {
    super(message);
  }
}

export async function apiRequest<T>(
  path: string,
  init: RequestInit,
): Promise<T> {
  const headers = new Headers(init.headers);
  const csrfToken = sessionStorage.getItem("amirl_csrf");
  if (csrfToken && !["GET", "HEAD"].includes(init.method ?? "GET")) {
    headers.set("x-csrf-token", csrfToken);
  }
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...init,
      credentials: "include",
      headers,
    });
  } catch {
    throw new ApiRequestError(
      "Unable to reach the server. Check that the backend is running and try again.",
      0,
      "NETWORK_UNAVAILABLE",
    );
  }
  const payload = (await response.json().catch(() => null)) as unknown;
  if (!response.ok) {
    const record =
      payload && !Array.isArray(payload) && typeof payload === "object"
        ? (payload as Record<string, unknown>)
        : undefined;
    if (
      response.status === 401 &&
      record?.code === "SESSION_INVALID" &&
      path !== "/auth/me"
    ) {
      window.dispatchEvent(new Event("amirl:session-invalid"));
    }
    const message =
      typeof record?.message === "string"
        ? record.message
        : safeStatusMessage(response.status);
    const code = typeof record?.code === "string" ? record.code : undefined;
    const issues = Array.isArray(record?.issues)
      ? record.issues.flatMap(normalizeIssue)
      : [];
    throw new ApiRequestError(message, response.status, code, issues);
  }
  return payload as T;
}

function normalizeIssue(value: unknown): ReviewIssue[] {
  if (!value || Array.isArray(value) || typeof value !== "object") return [];
  const record = value as Record<string, unknown>;
  if (typeof record.message !== "string") return [];
  return [
    {
      message: record.message,
      ...(typeof record.itemId === "string" ? { itemId: record.itemId } : {}),
      ...(typeof record.code === "string" ? { code: record.code } : {}),
      ...(typeof record.field === "string" ? { field: record.field } : {}),
      ...(isIssueTone(record.tone) ? { tone: record.tone } : {}),
    },
  ];
}

function isIssueTone(value: unknown): value is ReviewIssue["tone"] {
  return (
    value === "error" ||
    value === "warning" ||
    value === "pending" ||
    value === "success" ||
    value === "info" ||
    value === "neutral"
  );
}

function safeStatusMessage(status: number): string {
  if (status === 400)
    return "The submitted data could not be accepted. Check the form and try again.";
  if (status === 401) return "Authentication is required to continue.";
  if (status === 403)
    return "You do not have permission to perform this action.";
  if (status === 404) return "The requested record could not be found.";
  if (status === 409)
    return "This record changed while you were working. Reload and try again.";
  if (status >= 500)
    return "The server could not complete the request. Try again.";
  return "The request could not be completed.";
}
