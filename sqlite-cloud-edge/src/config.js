import 'dotenv/config';

export const config = {
  dbName: process.env.SQLITECLOUD_DB_NAME || 'lotusia',
  dbUrl: process.env.SQLITECLOUD_DB_URL || '',
  adminUrl: process.env.SQLITECLOUD_ADMIN_URL || '',
  sqliteHost: process.env.SQLITECLOUD_HOST || '',
  sqliteApiKey: process.env.SQLITECLOUD_API_KEY || '',
  lotusApiBaseUrl: process.env.LOTUS_API_BASE_URL || '',
  lotusApiAuthToken: process.env.LOTUS_API_AUTH_TOKEN || '',
  explorerFallbackBase: process.env.EXPLORER_FALLBACK_BASE || 'https://explorer.lotusia.org',
  fallbackExplorerApiBase: process.env.FALLBACK_EXPLORER_API_BASE || 'https://explorer.lotusia.org',
  fallbackSocialApiBase: process.env.FALLBACK_SOCIAL_API_BASE || '',
  enableSocialFallback: String(process.env.ENABLE_SOCIAL_FALLBACK || '').toLowerCase() === 'true',
  port: Number(process.env.PORT || 8788)
};

if (!config.dbUrl) {
  console.warn('[sqlite-cloud-edge] SQLITECLOUD_DB_URL is not set');
}

if (!config.lotusApiBaseUrl) {
  console.warn('[sqlite-cloud-edge] LOTUS_API_BASE_URL is not set');
}

