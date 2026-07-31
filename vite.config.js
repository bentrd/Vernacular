import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// `public/` stays the static directory: dictionary packs, icons, the manifest,
// and sw.js are copied into dist/ verbatim, so /data/packs/<code>.json keeps
// working and api/cron.js can keep reading the packs off disk.
export default defineConfig({
  plugins: [react()],
  build: { outDir: 'dist', assetsDir: 'assets' },
  server: { port: 4173 },
});
