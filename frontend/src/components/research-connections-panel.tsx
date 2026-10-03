"use client";

import { cn } from "@/lib/cn";
import { loadingPlaceholder } from "@/lib/loading-style";
import { SyntheticEvent, useCallback, useEffect, useState } from "react";
import { ExternalLink, Link2, Search } from "lucide-react";
import { ApiRequestError, apiRequest } from "@/lib/client-api";
import { Badge } from "@/components/ui/badge";
import {
  ReviewIssueStamp,
  SemanticStatus,
} from "@/components/ui/semantic-status";
import { useReviewIssues } from "@/lib/use-review-issues";
import { InputControl } from "@/components/ui/form-controls";
import { FormField } from "@/components/ui/form-field";
import { ButtonControl, ButtonLink } from "@/components/ui/button-control";
import { useNotifications } from "@/components/notification-provider";
import { useAuth } from "@/components/auth-provider";

interface ConnectionItem {
  displayName: string;
  researchItem: {
    id: string;
    title: string | null;
    type: string;
    canonicalUrl: string | null;
    reviewStatus: string;
    automationVersion: number;
  };
}

interface ConnectionRequest {
  id: string;
  source: "SOURCE_METADATA" | "USER_CLAIM" | "ADMIN_MANUAL";
  status: "PROPOSED" | "VERIFIED" | "REJECTED";
  contributor: ConnectionItem;
}

interface ConnectionOverview {
  connections: ConnectionItem[];
  requests: ConnectionRequest[];
}

interface SearchResult {
  id: string;
  title: string | null;
  type: string;
  canonicalUrl: string | null;
  automationVersion: number;
  automationState: string;
  contributors: Array<{
    displayName: string;
    personId: string | null;
    sortOrder: number;
  }>;
}

function outputOnly<
  T extends { researchItem?: { type: string }; type?: string },
>(item: T): boolean {
  return (item.researchItem?.type ?? item.type) !== "PROJECT";
}

export function ResearchConnectionsPanel() {
  const { user, loading: authLoading } = useAuth();
  const { showToast } = useNotifications();
  const staff = user?.role === "ADMIN" || user?.role === "MODERATOR";
  const [overview, setOverview] = useState<ConnectionOverview>();
  const [results, setResults] = useState<SearchResult[]>([]);
  const [query, setQuery] = useState("");
  const [evidenceUrl, setEvidenceUrl] = useState("");
  const [claiming, setClaiming] = useState<string>();
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string>();
  const claimIssues = useReviewIssues();

  const load = useCallback(async () => {
    if (staff) return;
    try {
      setOverview(
        await apiRequest<ConnectionOverview>("/research-connections/mine", {
          method: "GET",
        }),
      );
      setError(undefined);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to load connections.",
      );
    }
  }, [staff]);

  useEffect(() => {
    if (staff) return;
    let active = true;
    void apiRequest<ConnectionOverview>("/research-connections/mine", {
      method: "GET",
    })
      .then((result) => {
        if (active) setOverview(result);
      })
      .catch((caught: unknown) => {
        if (active) {
          setError(
            caught instanceof Error
              ? caught.message
              : "Unable to load connections.",
          );
        }
      });
    return () => {
      active = false;
    };
  }, [staff]);

  async function search(event: SyntheticEvent<HTMLFormElement, SubmitEvent>) {
    event.preventDefault();
    setError(undefined);
    setSearching(true);
    try {
      setResults(
        await apiRequest<SearchResult[]>(
          `/research-connections/search?query=${encodeURIComponent(query)}`,
          { method: "GET" },
        ),
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Search failed.");
    } finally {
      setSearching(false);
    }
  }

  async function claim(
    itemId: string,
    sortOrder: number,
    expectedAutomationVersion: number,
  ) {
    const key = `${itemId}:${sortOrder}`;
    setClaiming(key);
    claimIssues.clearOne(key);
    try {
      await apiRequest(`/research/${itemId}/contributors/${sortOrder}/claim`, {
        body: JSON.stringify({
          evidenceUrl: evidenceUrl || undefined,
          expectedAutomationVersion,
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      showToast({
        body: "The connection will remain private until a moderator verifies it.",
        title: "Connection request sent",
      });
      await load();
      setResults(await apiRequest<SearchResult[]>(
        `/research-connections/search?query=${encodeURIComponent(query)}`,
        { method: "GET" },
      ));
    } catch (caught) {
      const message =
        caught instanceof ApiRequestError
          ? caught.message
          : "The connection request could not be sent.";
      claimIssues.setOne(key, {
        code:
          caught instanceof ApiRequestError
            ? (caught.code ?? "CLAIM_FAILED")
            : "CLAIM_FAILED",
        message,
        tone: "error",
      });
      showToast({
        body: message,
        title: "Connection request was not sent",
        tone: "error",
      });
    } finally {
      setClaiming(undefined);
    }
  }

  const visibleOverview = staff ? { connections: [], requests: [] } : overview;
  const loading = !staff && !overview;
  const pending = (visibleOverview?.requests ?? []).filter(
    ({ status }) => status === "PROPOSED",
  );
  const connections = (visibleOverview?.connections ?? []).filter(outputOnly);
  const outputRequests = pending.filter((request) =>
    outputOnly(request.contributor),
  );
  const outputResults = results.filter(outputOnly);
  if (!authLoading && staff) {
    return (
      <section
        className="frame-rail-section mt-6 grid gap-6 py-[clamp(1.2rem,3vw,2rem)]"
        aria-labelledby="research-admin-title"
      >
        <div>
          <p className="m-0 mb-4 font-[var(--font-sans)] text-[.75rem] font-extrabold uppercase tracking-[.12em] text-brand">
            Research administration
          </p>
          <h2
            className="mt-[.35rem] font-sans text-[clamp(1.8rem,4vw,2.8rem)]"
            id="research-admin-title"
          >
            Paper and dataset register
          </h2>
          <p className="mt-3 max-w-[720px] text-[.86rem] leading-[1.6] text-ink-muted">
            Staff create records on behalf of registered members. Imported and
            newly submitted records remain in the verification queue until
            contributor identities and source evidence are reviewed.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <ButtonLink href="/workspace/research" variant="secondary">
            Open papers & datasets review
          </ButtonLink>
        </div>
      </section>
    );
  }
  return (
    <section
      className="frame-rail-section mt-6 grid gap-6 py-[clamp(1.2rem,3vw,2rem)]"
      aria-labelledby="research-connections-title"
      data-loading={loading || undefined}
    >
      <div className="flex items-end justify-between gap-4 max-[640px]:flex-col max-[640px]:items-start">
        <div>
          <p className="m-0 mb-4 font-[var(--font-sans)] text-[.75rem] font-extrabold uppercase tracking-[.12em] text-brand">
            Entity relationships
          </p>
          <h2
            className="mt-[.35rem] font-sans text-[clamp(1.8rem,4vw,2.8rem)]"
            id="research-connections-title"
          >
            Research connections
          </h2>
        </div>
        <Badge loading={loading}>{connections.length} verified</Badge>
      </div>

      {loading || connections.length ? (
        <div className="grid border-t border-line">
          {(loading
            ? Array.from({ length: 2 }, () => undefined)
            : connections
          ).map((connection, index) => {
            const displayName = connection?.displayName;
            const researchItem = connection?.researchItem;
            return (
              <article
                className="flex items-center justify-between gap-4 border-b border-line py-4 max-[640px]:flex-col max-[640px]:items-start"
                key={
                  researchItem
                    ? `${researchItem.id}:${displayName}`
                    : `connection-loading-${index}`
                }
              >
                <div className="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-[.3rem]">
                  <Badge dot loading={loading} tone="success">
                    Verified
                  </Badge>
                  <strong
                    className={cn(
                      "col-start-2",
                      loadingPlaceholder(loading, "text", "long"),
                    )}
                    data-placeholder="text"
                    data-placeholder-width="long"
                  >
                    {researchItem?.title ?? "Loading research output"}
                  </strong>
                  <small
                    className={cn(
                      "col-start-2 text-ink-muted",
                      loadingPlaceholder(loading, "label", "medium"),
                    )}
                    data-placeholder="label"
                    data-placeholder-width="medium"
                  >
                    {researchItem
                      ? `${researchItem.type.toLowerCase()} · linked as ${displayName}`
                      : "Loading relationship"}
                  </small>
                </div>
                {loading ? (
                  <span
                    aria-hidden="true"
                    className={loadingPlaceholder(true, "label")}
                  >
                    Source
                  </span>
                ) : researchItem?.canonicalUrl ? (
                  <a
                    className="inline-flex items-center gap-[.3rem] text-[.75rem] text-brand"
                    href={researchItem.canonicalUrl}
                    rel="noreferrer"
                    target="_blank"
                  >
                    Source <ExternalLink aria-hidden="true" size={14} />
                  </a>
                ) : null}
              </article>
            );
          })}
        </div>
      ) : (
        <p className="m-0 text-[.82rem] leading-[1.5] text-ink-muted">
          No verified output connections yet.
        </p>
      )}

      {outputRequests.length ? (
        <div className="grid gap-3 border-l-[3px] border-warning bg-warning-soft p-4">
          <h3 className="font-sans text-[1.05rem]">Awaiting verification</h3>
          {outputRequests.map((request) => (
            <div
              className="grid grid-cols-[auto_1fr] items-center gap-x-[.65rem] gap-y-1"
              key={request.id}
            >
              <Badge dot tone="warning">
                Proposed
              </Badge>
              <p className="m-0">
                {request.contributor.researchItem.title ??
                  "Untitled research output"}
              </p>
              <small className="col-start-2 m-0 text-ink-muted">
                {request.source === "SOURCE_METADATA"
                  ? "Matched from source metadata"
                  : "Claim submitted by you"}
              </small>
            </div>
          ))}
        </div>
      ) : null}

      <form
        className="grid grid-cols-[minmax(220px,1fr)_minmax(220px,1fr)_auto] items-end gap-[.8rem] border-t border-line pt-5 max-[640px]:grid-cols-1"
        onSubmit={search}
      >
        <FormField
          htmlFor="connection-search"
          label="Find a published output to claim"
        >
          <div className="relative grid items-center">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute left-3 z-[1] text-ink-muted"
              size={17}
            />
            <InputControl
              data-placeholder={loading ? "control" : undefined}
              disabled={loading}
              className={cn("pl-10", loadingPlaceholder(loading, "control"))}
              id="connection-search"
              minLength={2}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Title, canonical URL, or contributor"
              required
              value={query}
            />
          </div>
        </FormField>
        <FormField
          htmlFor="connection-evidence"
          label="Supporting URL (recommended)"
        >
          <InputControl
            className={loadingPlaceholder(loading, "control")}
            data-placeholder={loading ? "control" : undefined}
            disabled={loading}
            id="connection-evidence"
            onChange={(event) => setEvidenceUrl(event.target.value)}
            placeholder="ORCID, publisher profile, or institutional page"
            type="url"
            value={evidenceUrl}
          />
        </FormField>
        <ButtonControl loading={loading} disabled={searching} type="submit">
          {searching ? "Searching…" : "Search outputs"}
        </ButtonControl>
      </form>

      {outputResults.length ? (
        <div className="grid gap-3">
          {outputResults.map((item) => (
            <article
              className="grid gap-4 border border-line p-4"
              key={item.id}
            >
              <div>
                <span className="font-mono text-[.62rem] uppercase text-brand">
                  {item.type.toLowerCase()}
                </span>
                <h3 className="mt-1 font-sans text-[1.2rem]">
                  {item.title ?? "Untitled research output"}
                </h3>
              </div>
              <div className="grid">
                {item.contributors.map((contributor) => {
                  const key = `${item.id}:${contributor.sortOrder}`;
                  return (
                    <div
                      className="relative flex items-center justify-between gap-4 border-t border-line py-[.65rem] pr-10 max-[640px]:flex-col max-[640px]:items-stretch"
                      key={key}
                    >
                      <ReviewIssueStamp issue={claimIssues.forItem(key)[0]} />
                      <div className="grid gap-1">
                        <span>{contributor.displayName}</span>
                        {claimIssues.forItem(key)[0] ? (
                          <SemanticStatus
                            tone={claimIssues.forItem(key)[0].tone}
                          >
                            {claimIssues.forItem(key)[0].message}
                          </SemanticStatus>
                        ) : null}
                      </div>
                      {contributor.personId ? (
                        <SemanticStatus tone="success">
                          Already linked
                        </SemanticStatus>
                      ) : (
                        <ButtonControl
                          compact
                          disabled={claiming === key || item.automationState === "QUEUED" || item.automationState === "RUNNING"}
                          onClick={() =>
                            void claim(
                              item.id,
                              contributor.sortOrder,
                              item.automationVersion,
                            )
                          }
                          variant="secondary"
                        >
                          <Link2 aria-hidden="true" size={14} />
                          Request link
                        </ButtonControl>
                      )}
                    </div>
                  );
                })}
              </div>
            </article>
          ))}
        </div>
      ) : null}
      {error ? (
        <p className="m-0 flex items-center gap-[.45rem] text-[.82rem] leading-[1.5] text-ink-muted rounded-panel bg-danger-soft p-[.8rem] text-danger">
          {error}
        </p>
      ) : null}
    </section>
  );
}
