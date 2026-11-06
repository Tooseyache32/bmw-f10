import { createPool } from './config.js';
import { createApp } from './app.js';
const pool = createPool();
pool.on('error', () => console.error('A PostgreSQL pool connection became unavailable.'));
const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || '127.0.0.1';
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT.');
const app = createApp({ pool });
const server = app.listen(port,host,() => console.log(`F10 Anatomy listening on http://${host}:${port}; use /api/ready to check PostgreSQL.`));
server.on('error', () => { console.error('HTTP server could not bind to the configured host/port.'); process.exitCode=1; void pool.end(); });
let closing = false;
async function close() {
  if (closing) return;
  closing=true;
  server.close(async () => { await pool.end(); process.exit(0); });
  setTimeout(() => process.exit(1),10000).unref();
}
process.on('SIGINT',close);
process.on('SIGTERM',close);
