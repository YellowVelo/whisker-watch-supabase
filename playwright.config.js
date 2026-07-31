import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';

// Deliberately .env.playwright, not .env — this suite must never
// accidentally point at whatever project a developer's local .env
// happens to be pointed at (which could be wysker-watch-staging or,
// in a misconfiguration, prod). See .env.playwright.example.
dotenv.config({ path: '.env.playwright' });

const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:5173';

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.js',
  // All 5 tests share one real account (test1@) and mutate its live
  // data (adding/deleting pets, recording check-ins) — running them
  // concurrently would mean tests stepping on each other's state.
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'list',
  timeout: 30_000,
  use: {
    baseURL,
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: 'npm run dev',
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
