"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import { ButtonControl } from "@/components/ui/button-control";
import { FormMessage } from "@/components/ui/form-field";
import { apiRequest } from "@/lib/client-api";

const subscribeToHydration = () => () => undefined;
const TOKEN_STORAGE_KEY = "amirl_email_revert_token";
const TOKEN_EVENT = "amirl-email-revert-token";

function readToken(): string | null {
  if (typeof window === "undefined") return null;
  const hashToken = new URLSearchParams(window.location.hash.slice(1)).get(
    "token",
  );
  return hashToken?.trim() || sessionStorage.getItem(TOKEN_STORAGE_KEY);
}

function subscribeToToken(onStoreChange: () => void) {
  window.addEventListener("hashchange", onStoreChange);
  window.addEventListener(TOKEN_EVENT, onStoreChange);
  return () => {
    window.removeEventListener("hashchange", onStoreChange);
    window.removeEventListener(TOKEN_EVENT, onStoreChange);
  };
}

export function RevertEmailForm() {
  const hydrated = useSyncExternalStore(
    subscribeToHydration,
    () => true,
    () => false,
  );
  const token = useSyncExternalStore(subscribeToToken, readToken, () => null);
  const [saving, setSaving] = useState(false);
  const [reverted, setReverted] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (!hydrated || !token || !window.location.hash) return;
    sessionStorage.setItem(TOKEN_STORAGE_KEY, token);
    window.dispatchEvent(new Event(TOKEN_EVENT));
    window.history.replaceState(null, "", window.location.pathname);
  }, [hydrated, token]);

  async function revert() {
    setSaving(true);
    setError(undefined);
    try {
      await apiRequest("/auth/email-change/revert", {
        body: JSON.stringify({ token }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      sessionStorage.removeItem("amirl_csrf");
      sessionStorage.removeItem(TOKEN_STORAGE_KEY);
      window.dispatchEvent(new Event(TOKEN_EVENT));
      setReverted(true);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to revert the email change.",
      );
    } finally {
      setSaving(false);
    }
  }

  if (reverted) {
    return (
      <div className="mt-8 grid gap-5 border-y border-line-strong py-5">
        <p className="m-0 text-sm leading-6 text-ink-muted">
          The pending change was cancelled or the previous login email was
          restored. If the change had completed, all sessions were signed out.
        </p>
        <Link
          className="font-semibold text-brand hover:text-brand-hover"
          href="/login"
        >
          Return to login
        </Link>
      </div>
    );
  }

  return (
    <div className="mt-8 grid gap-5 border-y border-line-strong py-5">
      <p className="m-0 text-sm leading-6 text-ink-muted">
        Confirming will restore the previous login email and sign out every
        active session for the account.
      </p>
      {error ? <FormMessage>{error}</FormMessage> : null}
      {!token ? (
        <FormMessage>
          This revert link is missing its security token.
        </FormMessage>
      ) : null}
      <div>
        <ButtonControl
          disabled={!token || saving}
          loading={saving}
          onClick={revert}
          type="button"
          variant="primary"
        >
          Revert email change
        </ButtonControl>
      </div>
    </div>
  );
}
