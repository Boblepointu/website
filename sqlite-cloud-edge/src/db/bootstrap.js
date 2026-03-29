import { Database } from '@sqlitecloud/drivers';
import { config } from '../config.js';
import { resolveDbUrl } from './client.js';

function inferDbUrlFromAdmin(adminUrl, dbName) {
  const u = new URL(adminUrl);
  u.pathname = `/${dbName}`;
  return u.toString();
}

async function main() {
  if (!config.adminUrl && !(config.sqliteHost && config.sqliteApiKey)) {
    throw new Error('SQLITECLOUD_ADMIN_URL or SQLITECLOUD_HOST+SQLITECLOUD_API_KEY is required to create database');
  }
  const adminUrl =
    config.adminUrl ||
    `sqlitecloud://${config.sqliteHost}?apikey=${encodeURIComponent(config.sqliteApiKey)}`;
  const adminDb = new Database(adminUrl);
  try {
    await adminDb.sql(`CREATE DATABASE ${config.dbName} IF NOT EXISTS`);
    console.log(`[ok] ensured database "${config.dbName}" exists`);
  } finally {
    if (typeof adminDb.close === 'function') await adminDb.close();
  }

  const dbUrl = resolveDbUrl() || inferDbUrlFromAdmin(adminUrl, config.dbName);
  const appDb = new Database(dbUrl);
  try {
    const rows = await appDb.sql('SELECT 1 AS ok');
    console.log(`[ok] connected to "${config.dbName}"`, rows?.[0] || rows);
  } finally {
    if (typeof appDb.close === 'function') await appDb.close();
  }
}

main().catch((err) => {
  console.error('[bootstrap:db] failed:', err?.message || err);
  process.exit(1);
});

