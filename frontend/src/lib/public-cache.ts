import "server-only";
import { API_URL } from "./api-url";

import { getPublicCacheConfig } from "./cache-config";
export { getPublicCacheConfig } from "./cache-config";

export function publicFetch(
  path: string,
  live = false,
  maxTtlSeconds?: number,
) {
  const config = getPublicCacheConfig();
  return fetch(`${API_URL}${path}`, {
    signal: AbortSignal.timeout(5000),
    ...(config.enabled && !live
      ? {
          // Tags expire entries; the header also isolates namespaces in fetch cache keys.
          headers: { "x-public-cache-namespace": config.namespace },
          next: {
            tags: [config.tag],
            revalidate: Math.min(
              config.ttlSeconds,
              maxTtlSeconds ?? config.ttlSeconds,
            ),
          },
        }
      : { cache: "no-store" }),
  });
}
