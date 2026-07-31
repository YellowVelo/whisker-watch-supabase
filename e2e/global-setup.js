// Runs once before the whole Playwright suite. Signs in as
// test1@wyskerwatch.com directly via signInWithPassword (the anon key +
// the account's real password — no admin/secret key needed, since
// test1@ is already email-confirmed and password sign-in never
// requires the confirmation click-through), then saves that session as
// Playwright's storageState so every other test starts already logged
// in. The Login test (e2e/login.spec.js) deliberately does NOT use this
// — it's the one test that drives the real login form.
import { chromium } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.playwright' });

export const AUTH_FILE = path.join(process.cwd(), 'e2e/.auth/test1.json');

export default async function globalSetup(config) {
  const { baseURL } = config.projects[0].use;

  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;
  const email = process.env.PLAYWRIGHT_TEST1_EMAIL;
  const password = process.env.PLAYWRIGHT_TEST1_PASSWORD;

  if (!supabaseUrl || !supabaseAnonKey || !email || !password) {
    throw new Error(
      'Missing Playwright env vars. Copy .env.playwright.example to ' +
      '.env.playwright and fill in real wysker-watch-dev values.'
    );
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey);
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.session) {
    throw new Error(`global-setup: could not sign in as ${email}: ${error?.message}`);
  }

  // supabase-js's default localStorage key format: sb-<project-ref>-auth-token.
  const projectRef = new URL(supabaseUrl).hostname.split('.')[0];
  const storageKey = `sb-${projectRef}-auth-token`;

  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(baseURL);
  await page.evaluate(
    ([key, session]) => window.localStorage.setItem(key, JSON.stringify(session)),
    [storageKey, data.session]
  );
  // Reload so the app itself picks up the session (confirms it's a
  // real, usable session, not just a localStorage write that nothing reads).
  await page.reload();
  await page.waitForLoadState('networkidle');

  fs.mkdirSync(path.dirname(AUTH_FILE), { recursive: true });
  await page.context().storageState({ path: AUTH_FILE });
  await browser.close();
}
