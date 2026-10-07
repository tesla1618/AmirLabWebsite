export interface Environment {
  publicCacheRevalidationUrl?: string;
  publicCacheRevalidationSecret?: string;
  databaseUrl: string;
  frontendOrigins: string[];
  publicSiteUrl: string;
  publicSiteEmail: string;
  storageProvider: 'local' | 's3';
  storageBucket?: string;
  storageEndpoint?: string;
  storageRegion: string;
  storageAccessKeyId?: string;
  storageSecretAccessKey?: string;
  storageForcePathStyle: boolean;
  nodeEnv: 'development' | 'test' | 'production';
  port: number;
  sessionCookieName: string;
  sessionDays: number;
  passwordResetMinutes: number;
  smtpFrom: string;
  smtpHost?: string;
  smtpPort: number;
  smtpUser?: string;
  smtpPassword?: string;
  smtpSecure: boolean;
  smtpRequireTls: boolean;
  uploadRoot: string;
  redisUrl?: string;
  vapidPublicKey?: string;
  vapidPrivateKey?: string;
  vapidSubject?: string;
}

export function validateEnvironment(
  source: Record<string, unknown>,
): Environment {
  const publicCacheRevalidationUrl = optionalValue(
    source.PUBLIC_CACHE_REVALIDATION_URL,
  );
  const publicCacheRevalidationSecret = optionalValue(
    source.PUBLIC_CACHE_REVALIDATION_SECRET,
  );
  if (
    Boolean(publicCacheRevalidationUrl) !==
    Boolean(publicCacheRevalidationSecret)
  ) {
    throw new Error(
      'PUBLIC_CACHE_REVALIDATION_URL and PUBLIC_CACHE_REVALIDATION_SECRET must be configured together',
    );
  }
  if (publicCacheRevalidationUrl) {
    const url = new URL(publicCacheRevalidationUrl);
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname !== '/api/revalidate'
    ) {
      throw new Error(
        'PUBLIC_CACHE_REVALIDATION_URL must be an HTTP(S) /api/revalidate endpoint without credentials, query or fragment',
      );
    }
    if (
      !publicCacheRevalidationSecret ||
      publicCacheRevalidationSecret.length < 32
    ) {
      throw new Error(
        'PUBLIC_CACHE_REVALIDATION_SECRET must contain at least 32 characters',
      );
    }
  }
  const databaseUrl = requiredString(source, 'DATABASE_URL');
  const frontendOrigins = requiredString(source, 'FRONTEND_ORIGINS')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  const nodeEnv = optionalString(source.NODE_ENV, 'development');
  const smtpHost = optionalValue(source.SMTP_HOST);
  const smtpUser = optionalValue(source.SMTP_USER);
  const smtpPassword = optionalValue(source.SMTP_PASSWORD);
  const smtpConfigured = Boolean(smtpHost || smtpUser || smtpPassword);
  const uploadRoot = optionalValue(source.UPLOAD_ROOT);
  const smtpFromValue = optionalValue(source.SMTP_FROM);
  const storageProvider = optionalString(source.STORAGE_PROVIDER, 'local');
  const storageBucket = optionalValue(source.STORAGE_BUCKET);
  const storageEndpoint = optionalValue(source.STORAGE_ENDPOINT);
  const storageAccessKeyId = optionalValue(source.STORAGE_ACCESS_KEY_ID);
  const storageSecretAccessKey = optionalValue(
    source.STORAGE_SECRET_ACCESS_KEY,
  );
  const publicSiteUrl = optionalString(
    source.PUBLIC_SITE_URL,
    'http://localhost:3000',
  );
  const publicSiteEmail = optionalString(
    source.PUBLIC_SITE_EMAIL,
    'admin@example.test',
  );

  if (!['development', 'test', 'production'].includes(nodeEnv)) {
    throw new Error('NODE_ENV must be development, test, or production');
  }

  if (frontendOrigins.length === 0) {
    throw new Error('FRONTEND_ORIGINS must include at least one origin');
  }
  if (smtpConfigured && (!smtpHost || !smtpUser || !smtpPassword)) {
    throw new Error(
      'SMTP_HOST, SMTP_USER, and SMTP_PASSWORD must be configured together',
    );
  }
  if (nodeEnv === 'production' && !smtpConfigured) {
    throw new Error('SMTP configuration is required in production');
  }
  if (nodeEnv === 'production' && !smtpFromValue) {
    throw new Error('SMTP_FROM is required in production');
  }
  if (nodeEnv === 'production' && !uploadRoot && storageProvider === 'local') {
    throw new Error('UPLOAD_ROOT is required for local storage in production');
  }
  if (!['local', 's3'].includes(storageProvider)) {
    throw new Error('STORAGE_PROVIDER must be local or s3');
  }
  if (
    storageProvider === 's3' &&
    (!storageBucket || !storageAccessKeyId || !storageSecretAccessKey)
  ) {
    throw new Error(
      'STORAGE_BUCKET, STORAGE_ACCESS_KEY_ID, and STORAGE_SECRET_ACCESS_KEY are required for s3 storage',
    );
  }
  if (nodeEnv === 'production' && !source.PUBLIC_SITE_URL) {
    throw new Error('PUBLIC_SITE_URL is required in production');
  }
  if (nodeEnv === 'production' && !source.PUBLIC_SITE_EMAIL) {
    throw new Error('PUBLIC_SITE_EMAIL is required in production');
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(publicSiteEmail)) {
    throw new Error('PUBLIC_SITE_EMAIL must be a valid email address');
  }
  if (nodeEnv === 'production') {
    rejectProductionPlaceholder(databaseUrl, 'DATABASE_URL');
    rejectProductionPlaceholder(frontendOrigins.join(','), 'FRONTEND_ORIGINS');
    if (smtpFromValue) rejectProductionPlaceholder(smtpFromValue, 'SMTP_FROM');
    if (smtpHost) rejectProductionPlaceholder(smtpHost, 'SMTP_HOST');
    if (smtpUser) rejectProductionPlaceholder(smtpUser, 'SMTP_USER');
    if (smtpPassword)
      rejectProductionPlaceholder(smtpPassword, 'SMTP_PASSWORD');
    if (uploadRoot) rejectProductionPlaceholder(uploadRoot, 'UPLOAD_ROOT');
    if (storageBucket)
      rejectProductionPlaceholder(storageBucket, 'STORAGE_BUCKET');
    if (storageAccessKeyId)
      rejectProductionPlaceholder(storageAccessKeyId, 'STORAGE_ACCESS_KEY_ID');
    if (storageSecretAccessKey)
      rejectProductionPlaceholder(
        storageSecretAccessKey,
        'STORAGE_SECRET_ACCESS_KEY',
      );
    rejectProductionPlaceholder(publicSiteUrl, 'PUBLIC_SITE_URL');
    rejectProductionPlaceholder(publicSiteEmail, 'PUBLIC_SITE_EMAIL');
    validatePublicSiteUrl(publicSiteUrl);
  }

  return {
    publicCacheRevalidationUrl,
    publicCacheRevalidationSecret,
    databaseUrl,
    frontendOrigins,
    publicSiteUrl,
    publicSiteEmail,
    storageProvider: storageProvider as Environment['storageProvider'],
    storageBucket,
    storageEndpoint,
    storageRegion: optionalString(source.STORAGE_REGION, 'auto'),
    storageAccessKeyId,
    storageSecretAccessKey,
    storageForcePathStyle: booleanValue(
      source.STORAGE_FORCE_PATH_STYLE,
      false,
      'STORAGE_FORCE_PATH_STYLE',
    ),
    nodeEnv: nodeEnv as Environment['nodeEnv'],
    port: positiveInteger(source.PORT, 3001, 'PORT'),
    sessionCookieName: optionalString(
      source.SESSION_COOKIE_NAME,
      'amirl_session',
    ),
    sessionDays: positiveInteger(source.SESSION_DAYS, 30, 'SESSION_DAYS'),
    passwordResetMinutes: positiveInteger(
      source.PASSWORD_RESET_MINUTES,
      10,
      'PASSWORD_RESET_MINUTES',
    ),
    smtpFrom: smtpFromValue ?? `Application <${publicSiteEmail}>`,
    smtpHost,
    smtpPort: positiveInteger(source.SMTP_PORT, 2525, 'SMTP_PORT'),
    smtpUser,
    smtpPassword,
    smtpSecure: booleanValue(source.SMTP_SECURE, false, 'SMTP_SECURE'),
    smtpRequireTls: booleanValue(
      source.SMTP_REQUIRE_TLS,
      true,
      'SMTP_REQUIRE_TLS',
    ),
    uploadRoot: uploadRoot ?? './storage',
    redisUrl: optionalValue(source.REDIS_URL),
    vapidPublicKey: optionalValue(source.VAPID_PUBLIC_KEY),
    vapidPrivateKey: optionalValue(source.VAPID_PRIVATE_KEY),
    vapidSubject: optionalValue(source.VAPID_SUBJECT),
  };
}

function validatePublicSiteUrl(value: string): void {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('PUBLIC_SITE_URL must be a valid URL');
  }
  if (url.protocol !== 'https:') {
    throw new Error('PUBLIC_SITE_URL must use HTTPS in production');
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new Error(
      'PUBLIC_SITE_URL cannot contain credentials, a query, or a fragment',
    );
  }
}

function requiredString(source: Record<string, unknown>, key: string): string {
  const value = source[key];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${key} is required`);
  }
  return value;
}

function optionalString(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() !== '' ? value : fallback;
}

function optionalValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value : undefined;
}

function rejectProductionPlaceholder(value: string, key: string): void {
  if (
    /update_on_prod|replace[_-]?with|change[_-]?me|your[_-]|dummy|example\.com/i.test(
      value,
    )
  ) {
    throw new Error(`${key} contains a production placeholder`);
  }
}

function booleanValue(value: unknown, fallback: boolean, key: string): boolean {
  if (value === undefined || value === '') return fallback;
  if (value === true || value === 'true') return true;
  if (value === false || value === 'false') return false;
  throw new Error(`${key} must be true or false`);
}

function positiveInteger(
  value: unknown,
  fallback: number,
  key: string,
): number {
  if (value === undefined || value === '') {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${key} must be a positive integer`);
  }
  return parsed;
}
