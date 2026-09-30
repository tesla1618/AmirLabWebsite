"use client";

import { useRouter } from "next/navigation";
import { SyntheticEvent, useEffect, useState } from "react";
import { apiRequest } from "@/lib/client-api";
import { StatePanel } from "@/components/state-panel";
import { SelectControl } from "@/components/ui/select-control";
import { FormField, FormMessage } from "@/components/ui/form-field";
import { InputControl } from "@/components/ui/form-controls";
import { ButtonControl, ButtonLink } from "@/components/ui/button-control";
import { useNotifications } from "@/components/notification-provider";
import { WorkspaceRecord } from "@/components/workspace-record";

const ROLES = ["MEMBER", "MODERATOR", "ADMIN"] as const;
const RANKS = [
  "RESEARCH_INTERN",
  "RESEARCH_ASSISTANT",
  "RESEARCHER",
  "SENIOR_RESEARCHER",
  "LEAD_RESEARCHER",
  "DEPARTMENT_HEAD",
  "ADVISOR",
] as const;

interface EditableAccount {
  id: string;
  email: string | null;
  role: string;
  person: { fullName: string; rank: string | null } | null;
}

function readable(value: string): string {
  return value.replaceAll("_", " ").toLowerCase();
}

export function AccountForm({ accountId }: { accountId?: string }) {
  const router = useRouter();
  const { showToast } = useNotifications();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("MEMBER");
  const [rank, setRank] = useState("RESEARCH_INTERN");
  const [loading, setLoading] = useState(Boolean(accountId));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const [loadError, setLoadError] = useState<string>();

  useEffect(() => {
    if (!accountId) return;
    let active = true;
    void apiRequest<EditableAccount>(`/users/${accountId}`, { method: "GET" })
      .then((account) => {
        if (!active) return;
        setFullName(account.person?.fullName ?? "");
        setEmail(account.email ?? "");
        setRole(account.role);
        setRank(account.person?.rank ?? "NONE");
        setLoadError(undefined);
      })
      .catch((caught: unknown) => {
        if (active) {
          setLoadError(
            caught instanceof Error
              ? caught.message
              : "Unable to load account.",
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [accountId]);

  async function submit(event: SyntheticEvent<HTMLFormElement, SubmitEvent>) {
    event.preventDefault();
    setSaving(true);
    setError(undefined);
    try {
      await apiRequest(accountId ? `/users/${accountId}` : "/users", {
        body: JSON.stringify({
          ...(!accountId ? { email } : {}),
          fullName,
          rank: rank === "NONE" ? null : rank,
          role,
        }),
        headers: { "content-type": "application/json" },
        method: accountId ? "PATCH" : "POST",
      });
      showToast({
        body: accountId
          ? `${fullName}'s account details were updated.`
          : `${fullName}'s account was created and is pending setup. No access email was sent.`,
        title: accountId ? "Account updated" : "Account created",
      });
      router.push("/workspace/users");
      router.refresh();
    } catch (caught) {
      const message =
        caught instanceof Error
          ? caught.message
          : `Unable to ${accountId ? "update" : "create"} account.`;
      setError(message);
      showToast({
        body: message,
        title: accountId
          ? "Account was not updated"
          : "Account was not created",
        tone: "error",
      });
    } finally {
      setSaving(false);
    }
  }

  if (loadError && !loading) {
    return (
      <WorkspaceRecord
        backHref="/workspace/users"
        backLabel="Accounts"
        eyebrow="Account record"
        title="Account unavailable"
      >
        <StatePanel
          body="The account record could not be retrieved."
          title={loadError}
          variant="error"
        />
      </WorkspaceRecord>
    );
  }

  return (
    <WorkspaceRecord
      backHref="/workspace/users"
      backLabel="Accounts"
      description="Create a registered account, then send the one-time access email when it is ready."
      eyebrow="Account record"
      title={
        loading
          ? "Account record"
          : accountId
            ? fullName || "Edit account"
            : "New account"
      }
    >
      <form
        aria-busy={loading || undefined}
        className="mx-auto grid w-full max-w-[820px] gap-[1.35rem] border-y border-line-strong bg-transparent p-[clamp(1.25rem,3vw,2rem)] gap-[1.2rem]"
        data-loading={loading || undefined}
        onSubmit={submit}
      >
        <header className="grid gap-[.35rem] border-b border-line pb-[1.15rem]">
          <p className="m-0 font-mono text-[.62rem] font-semibold uppercase tracking-[.1em] text-brand">
            Account details
          </p>
          <h2 className="m-0 font-sans text-[clamp(1.4rem,2.4vw,2rem)] font-normal leading-[1.1]">
            Identity and access
          </h2>
        </header>
        <FormField htmlFor="account-name" label="Full name">
          <InputControl
            loading={loading}
            disabled={loading}
            id="account-name"
            onChange={(event) => setFullName(event.target.value)}
            required
            value={fullName}
          />
        </FormField>
        <FormField htmlFor="account-email" label="Email">
          <InputControl
            loading={loading}
            disabled={loading || Boolean(accountId)}
            id="account-email"
            onChange={(event) => setEmail(event.target.value)}
            required
            type="email"
            value={email}
          />
        </FormField>
        <FormField htmlFor="account-role" label="Permission role">
          <SelectControl
            disabled={loading}
            id="account-role"
            onValueChange={(value) => {
              setRole(value);
              if (!accountId && value === "ADMIN") setRank("NONE");
            }}
            options={ROLES.map((item) => ({
              label: readable(item),
              value: item,
            }))}
            value={role}
          />
        </FormField>
        <FormField
          description="Staff-only administrator accounts do not need an academic rank."
          htmlFor="account-rank"
          label="Research rank"
        >
          <SelectControl
            disabled={loading}
            id="account-rank"
            onValueChange={setRank}
            options={[
              { label: "No research rank", value: "NONE" },
              ...RANKS.map((item) => ({
                label: readable(item),
                value: item,
              })),
            ]}
            value={rank}
          />
        </FormField>
        {error ? <FormMessage>{error}</FormMessage> : null}
        <div className="flex flex-wrap justify-end gap-[.65rem] max-[640px]:justify-start">
          <ButtonLink href="/workspace/users">Cancel</ButtonLink>
          <ButtonControl
            loading={loading}
            disabled={saving}
            type="submit"
            variant="primary"
          >
            {accountId ? "Save account" : "Create account"}
          </ButtonControl>
        </div>
      </form>
    </WorkspaceRecord>
  );
}
