"use client";

import Link from "next/link";
import { SyntheticEvent, useState, useSyncExternalStore } from "react";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "@/lib/auth";
import { ApiRequestError, apiRequest } from "@/lib/client-api";
import {
  hasSessionEnded,
  setSessionEnded,
  subscribeSessionNotice,
} from "@/lib/session-notice";
import { ButtonControl } from "@/components/ui/button-control";
import { InputControl } from "@/components/ui/form-controls";
import { FormField, FormMessage } from "@/components/ui/form-field";
import { PasswordField } from "@/components/ui/password-field";

type LoginPhase = "idle" | "submitting" | "redirecting";

export function LoginForm() {
  const sessionEnded = useSyncExternalStore(
    subscribeSessionNotice,
    hasSessionEnded,
    () => false,
  );
  const [error, setError] = useState<string>();
  const [phase, setPhase] = useState<LoginPhase>("idle");
  const busy = phase !== "idle";

  async function submit(event: SyntheticEvent<HTMLFormElement, SubmitEvent>) {
    event.preventDefault();
    if (busy) return;

    setError(undefined);
    setPhase("submitting");
    const form = new FormData(event.currentTarget);

    try {
      const result = await apiRequest<{ csrfToken: string }>("/auth/login", {
        body: JSON.stringify({
          email: form.get("email"),
          password: form.get("password"),
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      setSessionEnded(false);
      sessionStorage.setItem("amirl_csrf", result.csrfToken);
      setPhase("redirecting");
      window.location.assign("/workspace");
    } catch (caught) {
      setError(
        caught instanceof ApiRequestError && caught.status === 401
          ? "Email or password is incorrect."
          : caught instanceof ApiRequestError &&
              caught.code === "NETWORK_UNAVAILABLE"
            ? "Unable to reach the server. Check your connection and try again."
            : "Unable to log in. Try again.",
      );
      setPhase("idle");
    }
  }

  return (
    <form
      aria-busy={busy || undefined}
      className="mt-8 grid gap-4"
      onSubmit={submit}
    >
      {sessionEnded ? (
        <FormMessage tone="info">
          Your session ended. Please log in again.
        </FormMessage>
      ) : null}
      <FormField
        className="gap-[.38rem]"
        htmlFor="login-email"
        label="Email"
        labelClassName="font-mono text-[.62rem] font-semibold uppercase tracking-[.045em]"
      >
        <InputControl
          autoComplete="email"
          disabled={busy}
          id="login-email"
          name="email"
          required
          type="email"
        />
      </FormField>
      <div className="grid gap-2">
        <PasswordField
          autoComplete="current-password"
          disabled={busy}
          id="login-password"
          label="Password"
          maxLength={PASSWORD_MAX_LENGTH}
          minLength={PASSWORD_MIN_LENGTH}
          name="password"
          required
        />
        <Link
          className="w-fit text-[.75rem] font-semibold text-brand hover:text-brand-hover"
          href="/forgot-password"
        >
          Forgot password?
        </Link>
      </div>
      {error ? <FormMessage>{error}</FormMessage> : null}
      {phase === "redirecting" ? (
        <FormMessage tone="success">
          Signed in. Opening your workspace…
        </FormMessage>
      ) : null}
      <ButtonControl
        className="mt-1 min-w-[148px] justify-self-start max-[560px]:w-full"
        disabled={busy}
        type="submit"
      >
        {phase === "submitting"
          ? "Signing in…"
          : phase === "redirecting"
            ? "Signed in · Opening workspace…"
            : "Log in"}
      </ButtonControl>
    </form>
  );
}
