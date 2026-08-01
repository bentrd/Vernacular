// Single Neon HTTP driver instance per function instance.
import { neon } from '@neondatabase/serverless';

let client = null;

export function db() {
  if (!client) {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set');
    client = neon(process.env.DATABASE_URL);
  }
  return client;
}
