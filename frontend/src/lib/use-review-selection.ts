"use client";

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef } from "react";

/**
 * The selected record of a master/detail review queue lives in the URL as
 * `${basePath}/${id}`, so any open review can be shared or reloaded.
 *
 * - Selecting replaces the history entry (no reload, no refetch, no Back
 *   spam); Next keeps usePathname in sync with native history updates.
 * - With no id in the URL, the first queue record opens once the queue is
 *   ready.
 * - When `viewKey` (page, filters, sort) changes, the new view's first record
 *   opens. Deep links and post-decision selections are left alone.
 */
export function useReviewSelection(
  basePath: string,
  {
    firstId,
    ready,
    viewKey,
  }: { firstId: string | undefined; ready: boolean; viewKey: string },
) {
  const pathname = usePathname();
  const rest = pathname.startsWith(`${basePath}/`)
    ? pathname.slice(basePath.length + 1).split("/")[0]
    : "";
  const selectedId = rest ? decodeURIComponent(rest) : undefined;

  const select = useCallback(
    (id: string | undefined) => {
      const next = id ? `${basePath}/${encodeURIComponent(id)}` : basePath;
      if (window.location.pathname === next) return;
      window.history.replaceState(null, "", `${next}${window.location.search}`);
    },
    [basePath],
  );

  const viewKeyRef = useRef(viewKey);
  const followFirstRef = useRef(false);
  useEffect(() => {
    if (viewKeyRef.current === viewKey) return;
    viewKeyRef.current = viewKey;
    followFirstRef.current = true;
  }, [viewKey]);

  useEffect(() => {
    if (!ready || !firstId) return;
    if (!selectedId || followFirstRef.current) {
      followFirstRef.current = false;
      select(firstId);
    }
  }, [firstId, ready, select, selectedId]);

  return { selectedId, select };
}
