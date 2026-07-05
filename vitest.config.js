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
  },
});
