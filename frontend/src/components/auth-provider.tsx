"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { ApiRequestError, apiRequest } from "@/lib/client-api";
import { setSessionEnded } from "@/lib/session-notice";
import type { AuthenticatedUser } from "@/lib/types";

interface AuthState {
  loading: boolean;
  logout: () => Promise<void>;
  refreshUser: () => Promise<AuthenticatedUser | null>;
  user: AuthenticatedUser | null;
}

interface AuthSession {
  csrfToken: string;
  user: AuthenticatedUser;
}

const AuthContext = createContext<AuthState | null>(null);

async function fetchAuthSession(): Promise<AuthSession> {
  return apiRequest<AuthSession>("/auth/me", { method: "GET" });
}

function rememberCsrfToken(session: AuthSession): void {
  sessionStorage.setItem("amirl_csrf", session.csrfToken);
}

function clearEndedSession(): void {
  if (sessionStorage.getItem("amirl_csrf")) setSessionEnded(true);
  sessionStorage.removeItem("amirl_csrf");
}

function isUnauthorized(error: unknown): boolean {
  return (
    (error instanceof ApiRequestError && error.status === 401) ||
    (error !== null &&
      typeof error === "object" &&
      "status" in error &&
      error.status === 401)
  );
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    try {
      const session = await fetchAuthSession();
      rememberCsrfToken(session);
      setUser(session.user);
      return session.user;
    } catch (caught) {
      if (isUnauthorized(caught)) {
        clearEndedSession();
        setUser(null);
        return null;
      }
      return null;
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await apiRequest<{ signedOut: true }>("/auth/logout", { method: "POST" });
    } finally {
      setSessionEnded(false);
      sessionStorage.removeItem("amirl_csrf");
      setUser(null);
      window.location.assign("/login");
    }
  }, []);

  useEffect(() => {
    let active = true;
    let retry: number | undefined;
    let attempts = 0;

    function loadSession() {
      attempts += 1;
      void fetchAuthSession()
        .then((session) => {
          if (!active) return;
          rememberCsrfToken(session);
          setUser(session.user);
          setLoading(false);
        })
        .catch((caught) => {
          if (!active) return;
          const unauthorized = isUnauthorized(caught);
          if (unauthorized) {
            clearEndedSession();
          }
          setUser(null);
          setLoading(false);
          if (unauthorized) return;
          const delay = Math.min(1_000 * 2 ** Math.min(attempts - 1, 3), 8_000);
          retry = window.setTimeout(loadSession, delay);
        });
    }

    loadSession();
    return () => {
      active = false;
      if (retry) window.clearTimeout(retry);
    };
  }, []);

  useEffect(() => {
    const invalidate = () => {
      clearEndedSession();
      setUser(null);
    };
    let checking = false;
    const reconcile = () => {
      if (!user || checking || document.visibilityState !== "visible") return;
      checking = true;
      void refreshUser().finally(() => {
        checking = false;
      });
    };
    window.addEventListener("amirl:session-invalid", invalidate);
    window.addEventListener("focus", reconcile);
    document.addEventListener("visibilitychange", reconcile);
    return () => {
      window.removeEventListener("amirl:session-invalid", invalidate);
      window.removeEventListener("focus", reconcile);
      document.removeEventListener("visibilitychange", reconcile);
    };
  }, [refreshUser, user]);

  return (
    <AuthContext.Provider value={{ loading, logout, refreshUser, user }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const auth = useContext(AuthContext);
  if (!auth) throw new Error("useAuth must be used inside AuthProvider");
  return auth;
}
