import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { sql } from './client.js';
import { closeDb } from './client.js';

const schemaFiles = [
  resolve(process.cwd(), 'schema/001_init.sql'),
  resolve(process.cwd(), 'schema/002_event_bus.sql'),
  resolve(process.cwd(), 'schema/003_indexes.sql'),
  resolve(process.cwd(), 'schema/004_domain_projection.sql'),
  resolve(process.cwd(), 'schema/005_domain_indexes.sql'),
  resolve(process.cwd(), 'schema/006_drop_legacy_social_tables.sql'),
  resolve(process.cwd(), 'schema/007_drop_domain_v1_tables.sql'),
  resolve(process.cwd(), 'schema/008_explorer_parity_tables.sql'),
  resolve(process.cwd(), 'schema/009_explorer_parity_indexes.sql')
];

async function runStatements(script) {
  const statements = script
    .split(/;\s*\n/g)
    .map((s) => s.trim())
    .filter(Boolean);
  for (const statement of statements) {
    await sql(statement);
  }
}

async function main() {
  try {
    for (const file of schemaFiles) {
      const content = readFileSync(file, 'utf-8');
      await runStatements(content);
      console.log('[ok] applied', file);
    }
    console.log('[ok] migrations complete');
  } finally {
    await closeDb();
  }
}

main().catch((err) => {
  console.error('[migrate] failed:', err?.message || err);
  process.exit(1);
});

