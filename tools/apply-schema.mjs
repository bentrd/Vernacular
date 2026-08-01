// Applies tools/schema.sql to the database in DATABASE_URL (or .env.local).
// Usage: node tools/apply-schema.mjs
import { readFileSync } from 'node:fs';
import { neon } from '@neondatabase/serverless';

let url = process.env.DATABASE_URL;
if (!url) {
  try {
    const env = readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
    url = env.match(/^DATABASE_URL="?([^"\n]+)"?/m)?.[1];
  } catch {
    /* fall through */
  }
}
if (!url) {
  console.error('DATABASE_URL not set and .env.local not found');
  process.exit(1);
}

const sql = neon(url);
const ddl = readFileSync(new URL('./schema.sql', import.meta.url), 'utf8');
const statements = ddl
  .split(/;\s*(?:\n|$)/)
  .map((s) => s.trim())
  .filter(Boolean);

for (const stmt of statements) {
  await sql.query(stmt);
}
const tables = await sql.query(
  `select table_name from information_schema.tables where table_schema = 'public' order by 1`
);
console.log('public tables:', tables.map((t) => t.table_name).join(', '));
