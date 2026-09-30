"use client";

import { ArrowDown, ArrowUp } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/cn";
import { loadingPlaceholder } from "@/lib/loading-style";

export function ExpandableBiography({
  text,
  loading = false,
}: {
  text?: string;
  loading?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const value = loading ? "Biography is loading" : text?.trim();
  if (!value) return null;
  const long = !loading && value.length > 520;
  return (
    <div className="mt-6 max-w-[760px]" data-loading={loading || undefined}>
      <p
        className={cn(
          "m-0 whitespace-pre-line text-[.92rem] leading-[1.65] text-ink-muted",
          long && !expanded && "line-clamp-7",
          loading && loadingPlaceholder(true, "text"),
        )}
        aria-hidden={loading || undefined}
        data-placeholder={loading ? "text" : undefined}
      >
        {value}
      </p>
      {long ? (
        <button
          aria-expanded={expanded}
          className="mt-[.9rem] inline-flex cursor-pointer items-center gap-[.4rem] border-0 bg-transparent p-0 text-[.75rem] font-bold text-brand hover:text-brand-hover"
          onClick={() => setExpanded((value) => !value)}
          type="button"
        >
          {expanded ? "Show less" : "Read full biography"}
          {expanded ? (
            <ArrowUp aria-hidden="true" size={15} />
          ) : (
            <ArrowDown aria-hidden="true" size={15} />
          )}
        </button>
      ) : null}
    </div>
  );
}
