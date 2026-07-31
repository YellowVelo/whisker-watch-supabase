import path from 'path';
import { defineConfig } from 'vitest/config';

// Separate from vite.config.js so unit tests don't pull in the
// Cloudflare Workers plugin (dev/build only, not needed to run pure
// logic tests, and adds startup overhead to `vitest`).
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'node',
    // supabase/functions/**/*.test.ts are Deno integration tests (Deno.test,
    // jsr: imports) run separately via `deno test` — vitest's default glob
    // would otherwise pick them up and fail trying to run them under Node.
    // e2e/**/*.spec.js are Playwright tests, run via `npm run test:e2e` —
    // same reason, vitest's default glob matches *.spec.js anywhere.
    exclude: ['**/node_modules/**', 'supabase/functions/**', 'e2e/**'],
  },
});
