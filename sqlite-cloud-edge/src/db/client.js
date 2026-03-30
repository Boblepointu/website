import { Database } from '@sqlitecloud/drivers';
import { config } from '../config.js';

let dbInstance = null;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
}

function toFiniteNumber(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function lockRetryConfig() {
  const retries = Math.max(
    0,
    Math.floor(
      toFiniteNumber(
        process.env.DB_LOCK_RETRIES ?? process.env.BACKFILL_DB_LOCK_RETRIES,
        24
      )
    )
  );
  const baseMs = Math.max(
    5,
    Math.floor(
      toFiniteNumber(
        process.env.DB_LOCK_BACKOFF_MS ?? process.env.BACKFILL_DB_LOCK_BACKOFF_MS,
        25
      )
    )
  );
  const maxMs = Math.max(
    baseMs,
    Math.floor(
      toFiniteNumber(
        process.env.DB_LOCK_MAX_BACKOFF_MS ?? process.env.BACKFILL_DB_LOCK_MAX_BACKOFF_MS,
        2000
      )
    )
  );
  const mult = Math.max(
    1.05,
    toFiniteNumber(
      process.env.DB_LOCK_BACKOFF_MULTIPLIER ?? process.env.BACKFILL_DB_LOCK_BACKOFF_MULTIPLIER,
      1.7
    )
  );
  return { retries, baseMs, maxMs, mult };
}

function isDbLockError(err) {
  const msg = String(err?.message || err || '').toLowerCase();
  const code = String(err?.errorCode || '').toLowerCase();
  const extCode = String(err?.externalErrorCode || '').toLowerCase();
  return (
    msg.includes('database is locked') ||
    msg.includes('database locked') ||
    msg.includes('sql_busy') ||
    code === '5' ||
    extCode === '5'
  );
}

export function resolveDbUrl() {
  if (config.dbUrl) return config.dbUrl;
  if (config.sqliteHost && config.sqliteApiKey) {
    return `sqlitecloud://${config.sqliteHost}/${config.dbName}?apikey=${encodeURIComponent(config.sqliteApiKey)}`;
  }
  return '';
}

export function getDb() {
  if (dbInstance) return dbInstance;
  const dbUrl = resolveDbUrl();
  if (!dbUrl) {
    throw new Error('SQLITECLOUD_DB_URL or SQLITECLOUD_HOST+SQLITECLOUD_API_KEY is required');
  }
  dbInstance = new Database(dbUrl);
  return dbInstance;
}

export async function sql(query, ...params) {
  const db = getDb();
  const cfg = lockRetryConfig();
  let attempt = 0;
  let delayMs = cfg.baseMs;
  while (true) {
    try {
      return await db.sql(query, ...params);
    } catch (err) {
      if (!isDbLockError(err) || attempt >= cfg.retries) throw err;
      const jitter = Math.floor(Math.random() * Math.min(120, Math.max(10, delayMs)));
      await sleep(delayMs + jitter);
      delayMs = Math.min(cfg.maxMs, Math.floor(delayMs * cfg.mult));
      attempt += 1;
    }
  }
}

export async function closeDb() {
  if (dbInstance && typeof dbInstance.close === 'function') {
    await dbInstance.close();
  }
  dbInstance = null;
}

