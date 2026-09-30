"use client";

import * as Popover from "@radix-ui/react-popover";
import { Filter, X } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, Suspense } from "react";
import { PaginationControls } from "@/components/pagination-controls";
import { PaperCard } from "@/components/paper-card";
import { StatePanel } from "@/components/state-panel";
import { Badge } from "@/components/ui/badge";
import { SelectControl } from "@/components/ui/select-control";
import { FormField } from "@/components/ui/form-field";
import { TabsControl } from "@/components/ui/tabs-control";
import { ToolbarSearchField } from "@/components/ui/toolbar-search-field";
import { ButtonControl } from "@/components/ui/button-control";
import { PublicSection } from "@/components/ui/public-shell";
import { apiRequest } from "@/lib/client-api";
import type { PaginatedResponse, ResearchItem } from "@/lib/types";

interface PublicationResponse extends PaginatedResponse<ResearchItem> {
  facets: {
    categories: Array<{ count: number; label: string; value: string }>;
    years: Array<{ count: number; value: number }>;
  };
}

const SORT_OPTIONS = [
  { label: "Newest first", value: "NEWEST" },
  { label: "Oldest first", value: "OLDEST" },
  { label: "Title A-Z", value: "TITLE" },
];

export function PublicationExplorer({
  staticLoading = false,
}: { staticLoading?: boolean } = {}) {
  if (staticLoading) {
    return <PublicationExplorerInner staticLoading={true} />;
  }
  return (
    <Suspense fallback={<PublicationExplorerInner staticLoading={true} />}>
      <PublicationExplorerWrapper />
    </Suspense>
  );
}

function PublicationExplorerWrapper() {
  const searchParams = useSearchParams();
  return <PublicationExplorerInner searchParams={searchParams} />;
}

function PublicationExplorerInner({
  staticLoading = false,
  searchParams,
}: {
  staticLoading?: boolean;
  searchParams?: ReturnType<typeof useSearchParams>;
}) {
  const router = useRouter();
  const [query, setQuery] = useState(searchParams?.get("search") ?? "");
  const [category, setCategory] = useState(
    searchParams?.get("category") ?? "ALL",
  );
  const [year, setYear] = useState(searchParams?.get("year") ?? "ALL");
  const [sort, setSort] = useState(searchParams?.get("sort") ?? "NEWEST");
  const [page, setPage] = useState(Number(searchParams?.get("page")) || 1);
  const [result, setResult] = useState<PublicationResponse>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const busy = staticLoading || loading;

  useEffect(() => {
    if (staticLoading) return;
    let active = true;
    const timeout = window.setTimeout(() => {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: "12",
        sort,
      });
      if (query.trim()) params.set("search", query.trim());
      if (category !== "ALL") params.set("category", category);
      if (year !== "ALL") params.set("year", year);
      router.replace(`/papers?${params}`, { scroll: false });
      void apiRequest<PublicationResponse>(`/publications?${params}`, {
        method: "GET",
      })
        .then((response) => {
          if (!active) return;
          setResult(response);
          setError(undefined);
        })
        .catch((caught: unknown) => {
          if (active)
            setError(
              caught instanceof Error
                ? caught.message
                : "Unable to load publications.",
            );
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }, 250);
    return () => {
      active = false;
      window.clearTimeout(timeout);
    };
  }, [category, page, query, router, sort, staticLoading, year]);

  function changeFilter(setter: (value: string) => void, value: string) {
    setLoading(true);
    setter(value);
    setPage(1);
  }

  function clearFilters() {
    setLoading(true);
    setQuery("");
    setCategory("ALL");
    setYear("ALL");
    setSort("NEWEST");
    setPage(1);
  }

  const categories = [
    {
      count: result?.facets.categories.reduce(
        (sum, item) => sum + item.count,
        0,
      ),
      label: "All",
      value: "ALL",
    },
    ...(result?.facets.categories ?? []),
  ];
  const visibleCategories = busy
    ? Array.from({ length: 4 }, (_, index) => ({
        label: "Category",
        value: index === 0 ? "ALL" : `LOADING_${index}`,
      }))
    : categories;
  const yearOptions = [
    { label: "All years", value: "ALL" },
    ...(result?.facets.years.map((item) => ({
      label: `${item.value} · ${item.count}`,
      value: String(item.value),
    })) ?? []),
  ];
  const activeFilters = Boolean(
    query || category !== "ALL" || year !== "ALL" || sort !== "NEWEST",
  );
  const visibleRows: Array<ResearchItem | undefined> = busy
    ? Array.from(
        { length: Math.max(result?.items.length ?? 0, 6) },
        () => undefined,
      )
    : (result?.items ?? []);

  return (
    <PublicSection
      aria-busy={busy || undefined}
      aria-label="Publication archive"
      contentClassName="grid gap-4 pt-6 pb-20"
    >
      <div className="grid grid-cols-[minmax(240px,1.55fr)_minmax(300px,.85fr)] items-end gap-[.65rem] pb-[.85rem] max-[640px]:grid-cols-[minmax(0,1fr)_auto]">
        <ToolbarSearchField
          id="publication-search"
          label="Search publications"
          loading={busy}
          onChange={(event) => {
            setLoading(true);
            setQuery(event.target.value);
            setPage(1);
          }}
          placeholder="Search title, author, venue, or DOI"
          value={query}
        />
        <div className="grid grid-cols-2 gap-2 max-[640px]:hidden">
          <SelectControl
            ariaLabel="Publication year"
            loading={busy}
            onValueChange={(value) => changeFilter(setYear, value)}
            options={yearOptions}
            value={year}
          />
          <SelectControl
            ariaLabel="Sort publications"
            loading={busy}
            onValueChange={(value) => changeFilter(setSort, value)}
            options={SORT_OPTIONS}
            value={sort}
          />
        </div>
        <Popover.Root>
          <Popover.Trigger
            className={`hidden min-h-[var(--control-height)] cursor-pointer items-center gap-[.35rem] rounded-control border border-line-strong px-[.7rem] py-[.55rem] text-[.72rem] max-[640px]:inline-flex ${busy ? "pointer-events-none border-transparent bg-surface-subtle text-transparent" : "bg-transparent text-ink"}`}
            disabled={busy}
          >
            <Filter aria-hidden="true" size={16} /> Filters
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Content
              align="end"
              className="z-[90] grid w-[min(300px,calc(100vw-2rem))] gap-[.8rem] rounded-dialog border border-line-strong bg-surface-raised p-4 shadow-[var(--shadow-float)]"
              sideOffset={8}
            >
              <FormField
                label="Year"
                labelClassName="text-[.78rem] font-[650] tracking-[.04em]"
              >
                <SelectControl
                  ariaLabel="Publication year"
                  loading={busy}
                  onValueChange={(value) => changeFilter(setYear, value)}
                  options={yearOptions}
                  value={year}
                />
              </FormField>
              <FormField
                label="Sort"
                labelClassName="text-[.78rem] font-[650] tracking-[.04em]"
              >
                <SelectControl
                  ariaLabel="Sort publications"
                  loading={busy}
                  onValueChange={(value) => changeFilter(setSort, value)}
                  options={SORT_OPTIONS}
                  value={sort}
                />
              </FormField>
              <Popover.Arrow className="fill-surface-raised" />
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>
      </div>

      <div className="flex items-end justify-between gap-4 overflow-hidden max-[640px]:flex-col max-[640px]:items-stretch max-[640px]:gap-0">
        <TabsControl
          ariaLabel="Publication categories"
          className="min-w-0 overflow-x-auto max-[640px]:order-2 max-[640px]:w-full"
          onValueChange={(value) => changeFilter(setCategory, value)}
          loading={busy}
          options={visibleCategories}
          value={category}
        />
        <div
          className="flex min-h-10 shrink-0 items-center gap-[.65rem] font-mono text-[.58rem] text-ink-muted max-[640px]:order-1 max-[640px]:justify-between"
          data-loading={busy || undefined}
        >
          <Badge loading={busy}>
            {busy ? "00 results" : `${result?.total ?? 0} results`}
          </Badge>
          {activeFilters ? (
            <ButtonControl
              className="font-[inherit]"
              compact
              loading={busy}
              onClick={clearFilters}
              variant="ghost"
            >
              Clear <X aria-hidden="true" size={13} />
            </ButtonControl>
          ) : null}
        </div>
      </div>

      <div className="min-w-0">
        {error && !result && !busy ? (
          <StatePanel
            body={error}
            title="Publications could not be loaded"
            variant="error"
          />
        ) : visibleRows.length ? (
          <div className="grid transition-opacity duration-[140ms]">
            {visibleRows.map((item, index) => (
              <PaperCard
                frame
                item={item}
                key={item?.id ?? `loading-paper-${index}`}
                loading={busy}
              />
            ))}
          </div>
        ) : (
          <StatePanel
            body="Try a broader title, author, year, or publication category."
            title="No publications match these filters"
          />
        )}
        {busy || result ? (
          <PaginationControls
            loading={busy}
            onPageChange={(next) => {
              setLoading(true);
              setPage(next);
              window.scrollTo({ behavior: "smooth", top: 180 });
            }}
            page={page}
            pageSize={result?.pageSize ?? 12}
            total={result?.total}
            totalPages={result?.totalPages ?? 1}
          />
        ) : null}
      </div>
    </PublicSection>
  );
}
