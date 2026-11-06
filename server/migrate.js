import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { root, createPool, databaseUrl, assertProjectDatabase } from './config.js';

export async function migrate(pool) {
  // No tracking table is needed for this single, idempotent initial migration.
  const client = await pool.connect();
  try {
    await client.query("SELECT pg_advisory_lock(hashtext('f10_anatomy_migration'))");
    await client.query(await readFile(path.join(root, 'db/001_schema.sql'), 'utf8'));
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.query("SELECT pg_advisory_unlock(hashtext('f10_anatomy_migration'))");
    client.release();
  }
}
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  assertProjectDatabase(databaseUrl);
  const pool = createPool();
  try { await migrate(pool); console.log('Initial schema ready (8 tables).'); }
  catch { console.error('Migration failed. Verify the isolated database connection and permissions.'); process.exitCode = 1; }
  finally { await pool.end(); }
}
