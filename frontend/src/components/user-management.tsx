"use client";

import { cn } from "@/lib/cn";
import { loadingPlaceholder } from "@/lib/loading-style";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ArchiveRestore,
  Mail,
  Pencil,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { ApiRequestError, apiRequest } from "@/lib/client-api";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { PaginationControls } from "@/components/pagination-controls";
import { StatePanel } from "@/components/state-panel";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button-control";
import { SelectControl } from "@/components/ui/select-control";
import { InputControl } from "@/components/ui/form-controls";
import {
  RowActionMenu,
  RowActionMenuItem,
} from "@/components/ui/row-action-menu";
import { FormField, FormMessage } from "@/components/ui/form-field";
import type { PaginatedResponse } from "@/lib/types";
import { useNotifications } from "@/components/notification-provider";
import {
  ReviewIssueStamp,
  SemanticStatus,
} from "@/components/ui/semantic-status";
import { useReviewIssues } from "@/lib/use-review-issues";
import {
  WorkspaceCollection,
  WorkspaceRow,
  WorkspaceRuleBand,
} from "@/components/ui/workspace-surface";

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
const ACCOUNT_RECOVERY_DAYS = 30;

interface Account {
  id: string;
  email: string | null;
  role: string;
  status: string;
  setupEmailQueuedAt: string | null;
  isDeleted: boolean;
  deletedAt: string | null;
  person: { fullName: string; rank: string | null; slug: string } | null;
}

function readable(value: string): string {
  return value.replaceAll("_", " ").toLowerCase();
}

function accountStatusLabel(status: string, isDeleted: boolean): string {
  if (isDeleted) return "deleted";
  return status === "PENDING_SETUP" ? "setup pending" : readable(status);
}

function recoveryLabel(deletedAt: string | null): string {
  if (!deletedAt) return `recoverable within ${ACCOUNT_RECOVERY_DAYS} days`;
  const expiresAt =
    new Date(deletedAt).getTime() + ACCOUNT_RECOVERY_DAYS * 24 * 60 * 60_000;
  const days = Math.max(
    0,
    Math.ceil((expiresAt - Date.now()) / (24 * 60 * 60_000)),
  );
  return `recoverable within ${days} days`;
}

function accountStatusTone(status: string, isDeleted: boolean): BadgeTone {
  if (isDeleted) return "error";
  if (status === "ACTIVE") return "success";
  if (status === "PENDING_SETUP") return "warning";
  if (status === "SUSPENDED") return "error";
  if (status === "ARCHIVED") return "neutral";
  return "neutral";
}

export function UserManagement() {
  const { showToast } = useNotifications();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [error, setError] = useState<string>();
  const [activeId, setActiveId] = useState<string>();
  const [pendingAccess, setPendingAccess] = useState<Account>();
  const [deletePending, setDeletePending] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState<PaginatedResponse<Account>>();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [role, setRole] = useState("ALL");
  const [status, setStatus] = useState("ALL");
  const [rank, setRank] = useState("ALL");
  const [sort, setSort] = useState("NEWEST");
  const [reload, setReload] = useState(0);
  const actionIssues = useReviewIssues();

  function beginRefresh() {
    setLoading(true);
  }

  useEffect(() => {
    let active = true;
    const timeout = window.setTimeout(() => {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: "20",
        sort,
      });
      params.set("deleted", status === "DELETED" ? "TRASH" : "ACTIVE");
      if (search.trim()) params.set("search", search.trim());
      if (role !== "ALL") params.set("role", role);
      if (status !== "ALL" && status !== "DELETED")
        params.set("status", status);
      if (rank !== "ALL") params.set("rank", rank);

      setLoading(true);
      setError(undefined);
      void apiRequest<PaginatedResponse<Account>>(`/users?${params}`, {
        method: "GET",
      })
        .then((response) => {
          if (!active) return;
          setResult(response);
          setAccounts(response.items);
        })
        .catch((caught: unknown) => {
          if (active) {
            setError(
              caught instanceof Error
                ? caught.message
                : "Unable to load accounts.",
            );
          }
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }, 250);
    return () => {
      active = false;
      window.clearTimeout(timeout);
    };
  }, [page, rank, reload, role, search, sort, status]);

  async function sendAccess(account: Account) {
    setError(undefined);
    setActiveId(account.id);
    try {
      const result = await apiRequest<{ queuedAt: string }>(
        `/users/${account.id}/send-access-email`,
        { method: "POST" },
      );
      setAccounts((current) =>
        current.map((item) =>
          item.id === account.id
            ? { ...item, setupEmailQueuedAt: result.queuedAt }
            : item,
        ),
      );
      actionIssues.clearOne(account.id);
      showToast({
        body: `A one-time setup link was queued for ${account.email}.`,
        title: "Access email queued",
      });
      setPendingAccess(undefined);
    } catch (caught) {
      const requestError =
        caught instanceof ApiRequestError ? caught : undefined;
      if (requestError?.issues.length) actionIssues.capture(requestError);
      else
        actionIssues.setOne(account.id, {
          code: "ACCESS_EMAIL_QUEUE_FAILED",
          message: "The access email could not be queued for this account.",
          tone: "error",
        });
      showToast({
        body: requestError?.message ?? "Unable to send access email.",
        title: "Access email was not sent",
        tone: "error",
      });
    } finally {
      setActiveId(undefined);
    }
  }

  async function deleteAccount(id: string) {
    setError(undefined);
    setActiveId(id);
    try {
      await apiRequest(`/users/${id}`, { method: "DELETE" });
      setAccounts((current) => current.filter((account) => account.id !== id));
      showToast({
        body: "The account was moved to trash and can be restored during the recovery period.",
        title: "Account deleted",
      });
      setDeletePending(undefined);
      setReload((value) => value + 1);
    } catch (caught) {
      const requestError =
        caught instanceof ApiRequestError ? caught : undefined;
      showToast({
        body: requestError?.message ?? "Unable to delete this account.",
        title: "Account was not deleted",
        tone: "error",
      });
    } finally {
      setActiveId(undefined);
    }
  }

  async function restoreAccount(id: string) {
    setError(undefined);
    setActiveId(id);
    try {
      await apiRequest(`/users/${id}/restore`, { method: "POST" });
      setAccounts((current) => current.filter((account) => account.id !== id));
      showToast({
        body: "The account was restored.",
        title: "Account restored",
      });
      setReload((value) => value + 1);
    } catch (caught) {
      const requestError =
        caught instanceof ApiRequestError ? caught : undefined;
      showToast({
        body: requestError?.message ?? "Unable to restore this account.",
        title: "Account was not restored",
        tone: "error",
      });
    } finally {
      setActiveId(undefined);
    }
  }

  return (
    <div className="grid gap-4">
      <div
        className="flex items-center justify-between gap-4 max-[640px]:flex-col max-[640px]:items-stretch"
        data-loading={loading || undefined}
      >
        <p
          className={loadingPlaceholder(loading, "label", "medium")}
          data-placeholder={loading ? "label" : undefined}
          data-placeholder-width="medium"
        >
          {result
            ? `${result.total} account${result.total === 1 ? "" : "s"}`
            : "Member accounts"}
        </p>
        <div className="flex flex-wrap justify-end gap-2">
          <ButtonLink href="/workspace/users/new" variant="primary">
            <Plus aria-hidden="true" size={16} /> New account
          </ButtonLink>
        </div>
      </div>

      {error && result ? <FormMessage>{error}</FormMessage> : null}

      <WorkspaceRuleBand contentClassName="grid min-w-0 grid-cols-[minmax(210px,1.5fr)_repeat(4,minmax(120px,.65fr))] items-end gap-[.8rem] px-[var(--workspace-gutter)] py-3.5 max-[980px]:grid-cols-2 max-[640px]:grid-cols-1 max-[640px]:px-4">
        <FormField
          className="min-w-0"
          htmlFor="account-search"
          label="Search accounts"
        >
          <div className="relative grid items-center">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute left-3 z-[1] text-ink-muted"
              size={17}
            />
            <InputControl
              className="pl-10"
              id="account-search"
              onChange={(event) => {
                beginRefresh();
                setSearch(event.target.value);
                setPage(1);
              }}
              placeholder="Name or email"
              value={search}
            />
          </div>
        </FormField>
        <FormField htmlFor="account-role" label="Role">
          <SelectControl
            id="account-role"
            onValueChange={(value) => {
              beginRefresh();
              setRole(value);
              setPage(1);
            }}
            options={[
              { label: "All roles", value: "ALL" },
              ...ROLES.map((item) => ({
                label: readable(item),
                value: item,
              })),
            ]}
            value={role}
          />
        </FormField>
        <FormField htmlFor="account-status" label="Status">
          <SelectControl
            id="account-status"
            onValueChange={(value) => {
              beginRefresh();
              setStatus(value);
              setPage(1);
            }}
            options={[
              { label: "All statuses", value: "ALL" },
              { label: "Setup pending", value: "PENDING_SETUP" },
              { label: "Active", value: "ACTIVE" },
              { label: "Suspended", value: "SUSPENDED" },
              { label: "Archived", value: "ARCHIVED" },
              { label: "Deleted", value: "DELETED" },
            ]}
            value={status}
          />
        </FormField>
        <FormField htmlFor="account-rank" label="Rank">
          <SelectControl
            id="account-rank"
            onValueChange={(value) => {
              beginRefresh();
              setRank(value);
              setPage(1);
            }}
            options={[
              { label: "All ranks", value: "ALL" },
              ...RANKS.map((item) => ({
                label: readable(item),
                value: item,
              })),
            ]}
            value={rank}
          />
        </FormField>
        <FormField htmlFor="account-sort" label="Sort">
          <SelectControl
            id="account-sort"
            onValueChange={(value) => {
              beginRefresh();
              setSort(value);
              setPage(1);
            }}
            options={[
              { label: "Newest first", value: "NEWEST" },
              { label: "Oldest first", value: "OLDEST" },
              { label: "Name A-Z", value: "NAME" },
            ]}
            value={sort}
          />
        </FormField>
      </WorkspaceRuleBand>

      {error && !result ? (
        <StatePanel
          frame="workspace"
          action={{
            label: "Retry",
            onClick: () => {
              beginRefresh();
              setReload((value) => value + 1);
            },
          }}
          body="The connection dropped. Nothing was lost; reconnect to continue."
          title="Could not load accounts"
          variant="error"
        />
      ) : !loading && !accounts.length ? (
        <StatePanel
          frame="workspace"
          body="Create the first member account from the page action above."
          title="No accounts yet"
        />
      ) : (
        <WorkspaceCollection data-loading={loading || undefined}>
          <div className="hidden grid-cols-[minmax(190px,1.05fr)_minmax(220px,1fr)_minmax(260px,1.05fr)_40px] items-center gap-4 border-b border-line px-[var(--workspace-gutter)] py-[.62rem] font-mono text-[.56rem] tracking-[.06em] text-ink-muted uppercase min-[701px]:grid">
            <span>Name</span>
            <span>Email</span>
            <span>Access</span>
            <span className="sr-only">Actions</span>
          </div>
          {(loading && !accounts.length
            ? Array.from({ length: 5 }, () => undefined)
            : accounts
          ).map((account, index) => {
            const issue = account
              ? actionIssues.forItem(account.id)[0]
              : undefined;
            return (
              <WorkspaceRow
                className="relative grid min-w-0 grid-cols-[minmax(190px,1.05fr)_minmax(220px,1fr)_minmax(260px,1.05fr)_40px] items-center gap-4 py-[.72rem] [overflow-wrap:anywhere] max-[700px]:grid-cols-[minmax(0,1fr)_40px] max-[700px]:gap-x-3 max-[700px]:gap-y-2 max-[700px]:py-3"
                key={account?.id ?? `account-loading-${index}`}
              >
                {account ? <ReviewIssueStamp issue={issue} /> : null}
                <div className="grid min-w-0 gap-[.18rem]">
                  <strong
                    className={cn(
                      "truncate text-[.82rem] font-medium leading-[1.35]",
                      loadingPlaceholder(loading, "text", "long"),
                    )}
                    data-placeholder="text"
                    data-placeholder-width="long"
                  >
                    {account?.person?.fullName ??
                      (loading ? "Loading account" : "Account without profile")}
                  </strong>
                  <span
                    className={cn(
                      "hidden truncate font-mono text-[.56rem] text-ink-faint max-[700px]:block",
                      loadingPlaceholder(loading, "label", "medium"),
                    )}
                    data-placeholder={loading ? "label" : undefined}
                  >
                    {account?.person?.rank
                      ? readable(account.person.rank)
                      : "No research rank"}
                  </span>
                </div>

                <div className="min-w-0 max-[700px]:col-start-1 max-[700px]:row-start-2">
                  {loading ? (
                    <span
                      className={cn(
                        "block text-[.76rem]",
                        loadingPlaceholder(true, "text", "long"),
                      )}
                      data-placeholder="text"
                      data-placeholder-width="long"
                    >
                      loading@example.org
                    </span>
                  ) : account?.email ? (
                    <span className="block truncate text-[.76rem] text-ink-muted">
                      {account.email}
                    </span>
                  ) : (
                    <SemanticStatus loading={loading} tone="warning">
                      Email not provided
                    </SemanticStatus>
                  )}
                </div>

                <div className="flex min-w-0 flex-wrap items-center gap-[.32rem] max-[700px]:col-start-1 max-[700px]:row-start-3">
                  <Badge loading={loading}>
                    {account ? readable(account.role) : "member"}
                  </Badge>
                  <Badge
                    dot
                    loading={loading}
                    tone={
                      account
                        ? accountStatusTone(account.status, account.isDeleted)
                        : "neutral"
                    }
                  >
                    {account
                      ? accountStatusLabel(account.status, account.isDeleted)
                      : "loading"}
                  </Badge>
                  {loading || account?.person?.rank ? (
                    <span className="max-[700px]:hidden">
                      <Badge loading={loading} tone="info">
                        {account?.person?.rank
                          ? readable(account.person.rank)
                          : "rank"}
                      </Badge>
                    </span>
                  ) : null}
                  {account?.isDeleted ? (
                    <Badge tone="warning">
                      {recoveryLabel(account.deletedAt)}
                    </Badge>
                  ) : null}
                  {issue ? (
                    <SemanticStatus
                      loading={loading}
                      tone={issue.tone ?? "error"}
                    >
                      {issue.message}
                    </SemanticStatus>
                  ) : null}
                  {!loading &&
                  account?.status === "PENDING_SETUP" &&
                  account.setupEmailQueuedAt ? (
                    <span className="basis-full font-mono text-[.54rem] text-ink-faint">
                      Access queued{" "}
                      {new Date(account.setupEmailQueuedAt).toLocaleString()}
                    </span>
                  ) : null}
                </div>

                <div className="flex justify-end max-[700px]:col-start-2 max-[700px]:row-span-3 max-[700px]:row-start-1 max-[700px]:self-start">
                  <RowActionMenu
                    disabled={loading || !account || activeId === account?.id}
                    label={
                      account?.person?.fullName
                        ? `Actions for ${account.person.fullName}`
                        : "Account actions"
                    }
                  >
                    {account?.isDeleted ? (
                      <RowActionMenuItem
                        onSelect={() => void restoreAccount(account.id)}
                      >
                        <ArchiveRestore aria-hidden="true" size={15} />
                        Restore account
                      </RowActionMenuItem>
                    ) : (
                      <>
                        {account?.status === "PENDING_SETUP" ? (
                          <RowActionMenuItem
                            disabled={!account.email}
                            onSelect={() => setPendingAccess(account)}
                          >
                            <Mail aria-hidden="true" size={15} />
                            {account.setupEmailQueuedAt
                              ? "Resend access email"
                              : "Send access email"}
                          </RowActionMenuItem>
                        ) : null}
                        <RowActionMenuItem asChild>
                          <Link
                            href={
                              account
                                ? `/workspace/users/${account.id}/edit`
                                : "#"
                            }
                          >
                            <Pencil aria-hidden="true" size={15} />
                            Edit account
                          </Link>
                        </RowActionMenuItem>
                        <RowActionMenuItem
                          danger
                          onSelect={() =>
                            account && setDeletePending(account.id)
                          }
                        >
                          <Trash2 aria-hidden="true" size={15} />
                          Delete account
                        </RowActionMenuItem>
                      </>
                    )}
                  </RowActionMenu>
                </div>
              </WorkspaceRow>
            );
          })}
        </WorkspaceCollection>
      )}
      {loading || result ? (
        <PaginationControls
          loading={loading}
          onPageChange={(nextPage) => {
            beginRefresh();
            setPage(nextPage);
          }}
          page={page}
          pageSize={result?.pageSize ?? 20}
          total={result?.total}
          totalPages={result?.totalPages ?? 1}
        />
      ) : null}
      <ConfirmDialog
        busy={activeId === pendingAccess?.id}
        confirmLabel={
          pendingAccess?.setupEmailQueuedAt
            ? "Resend access email"
            : "Send access email"
        }
        description={`A one-time account setup link will be queued for ${pendingAccess?.email ?? "this member"}. The link expires after 24 hours.`}
        onCancel={() => setPendingAccess(undefined)}
        onConfirm={() => {
          if (pendingAccess) void sendAccess(pendingAccess);
        }}
        open={Boolean(pendingAccess)}
        title={
          pendingAccess?.setupEmailQueuedAt
            ? "Send a new setup link?"
            : "Give this member account access?"
        }
      />
      <ConfirmDialog
        busy={activeId === deletePending}
        confirmLabel="Delete account"
        description={`This account will move to trash and remain recoverable for ${ACCOUNT_RECOVERY_DAYS} days.`}
        onCancel={() => setDeletePending(undefined)}
        onConfirm={() => {
          if (deletePending) void deleteAccount(deletePending);
        }}
        open={Boolean(deletePending)}
        title="Delete this account?"
        tone="danger"
      />
    </div>
  );
}
