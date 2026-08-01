// Dictionary packs, read off disk once per serverless instance.
// vercel.json bundles public/data/packs/** with the API functions.
import { readFileSync, readdirSync } from 'node:fs';

const dir = new URL('../public/data/packs/', import.meta.url);

let packs = null;

function load() {
  if (packs) return packs;
  packs = {};
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.json') || f === 'index.json') continue;
    const p = JSON.parse(readFileSync(new URL(f, dir), 'utf8'));
    packs[p.code] = p;
  }
  return packs;
}

export function getPack(code) {
  return load()[code] || null;
}

export function packCodes() {
  return Object.keys(load());
}
