export function getPublicCacheConfig() {
  const enabled = process.env.PUBLIC_CACHE_ENABLED?.trim() || "false";
  const ttlSeconds = Number(
    process.env.PUBLIC_CACHE_TTL_SECONDS?.trim() || "3600",
  );
  const namespace =
    process.env.PUBLIC_CACHE_NAMESPACE?.trim() || "amirlab-public-v1";
  if (enabled !== "true" && enabled !== "false") {
    throw new Error("PUBLIC_CACHE_ENABLED must be true or false");
  }
  if (!Number.isInteger(ttlSeconds) || ttlSeconds < 1 || ttlSeconds > 604800) {
    throw new Error(
      "PUBLIC_CACHE_TTL_SECONDS must be an integer from 1 to 604800",
    );
  }
  if (!/^[a-zA-Z0-9:_-]{1,100}$/.test(namespace)) {
    throw new Error(
      "PUBLIC_CACHE_NAMESPACE must contain 1–100 letters, numbers, colons, underscores or hyphens",
    );
  }
  return {
    enabled: enabled === "true",
    ttlSeconds,
    tag: `${namespace}:content`,
    namespace,
  };
}
