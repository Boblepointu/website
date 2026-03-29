import { Database } from '@sqlitecloud/drivers';
import { config } from '../config.js';

let dbInstance = null;

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
  return db.sql(query, ...params);
}

export async function closeDb() {
  if (dbInstance && typeof dbInstance.close === 'function') {
    await dbInstance.close();
  }
  dbInstance = null;
}

