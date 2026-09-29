const vercelPreviewHostSuffix = '-itsfuads-projects.vercel.app';

export function isAllowedCorsOrigin(
  origin: string,
  configuredOrigins: readonly string[],
): boolean {
  if (configuredOrigins.includes(origin)) return true;

  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return false;
  }

  return (
    url.protocol === 'https:' &&
    url.port === '' &&
    url.username === '' &&
    url.password === '' &&
    url.pathname === '/' &&
    url.search === '' &&
    url.hash === '' &&
    url.hostname.endsWith(vercelPreviewHostSuffix) &&
    url.hostname !== vercelPreviewHostSuffix
  );
}
