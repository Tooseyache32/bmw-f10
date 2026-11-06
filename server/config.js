import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import pg from 'pg';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const envPath = path.join(root, '.env');
if (existsSync(envPath)) process.loadEnvFile(envPath);
export const databaseUrl = process.env.DATABASE_URL || 'postgresql://f10_dev@127.0.0.1:55432/f10_anatomy';
export function createPool(connectionString = databaseUrl) {
  return new pg.Pool({ connectionString, max: 10, connectionTimeoutMillis: 3000, idleTimeoutMillis: 30000, statement_timeout: 10000 });
}
export function assertProjectDatabase(connectionString, testOnly = false) {
  const name = decodeURIComponent(new URL(connectionString).pathname.slice(1));
  if (testOnly ? !/^f10_anatomy(?:_[a-z0-9]+)?_test$/.test(name) : !/^f10_anatomy(?:_[a-z0-9]+)?(?:_test)?$/.test(name)) {
    throw new Error(testOnly ? 'Tests require a dedicated f10_anatomy*_test database.' : 'Refusing to migrate/seed a database outside the f10_anatomy namespace.');
  }
}
