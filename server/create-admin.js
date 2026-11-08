import { createPool, databaseUrl, assertProjectDatabase } from './config.js';
import { email, password, hashPassword } from './security.js';
assertProjectDatabase(databaseUrl);
const pool = createPool();
try {
  const address = email(process.env.ADMIN_EMAIL);
  const hashed = await hashPassword(password(process.env.ADMIN_PASSWORD));
   
  await pool.query("INSERT INTO users (email,name,password_hash,role) VALUES ($1,$2,$3,'admin')",[address,'Администратор',hashed]);
  console.log('Admin account created. Remove ADMIN_PASSWORD from your local environment after use.');
} catch (error) {
  console.error(error.code === '23505' ? 'Account already exists; no account was modified.' : 'Admin creation failed. Provide valid ADMIN_EMAIL / ADMIN_PASSWORD and a migrated project database.');
  process.exitCode=1;
} finally { await pool.end(); }
