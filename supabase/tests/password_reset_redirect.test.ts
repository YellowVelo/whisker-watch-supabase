// Integration test for spec 0074 (punch list PA-09): a password-reset link
// must send people to /reset-password. Run against wysker-watch-dev.
//
// Supabase only follows a link's redirect if that address is on the
// project's Authentication -> URL Configuration -> Redirect URLs list (a
// dashboard setting, not in the repo). Otherwise it silently falls back to
// the Site URL, and the person lands signed in on Home, never seeing Set
// New Password. That happened on prod on 2026-11-21.
//
// The test inboxes deliver to Lynn, but a test can't read them, so this
// builds the same link the email would contain with the admin API
// (generateLink sends no email), follows it one hop without jumping, and
// checks where Supabase would send the person. One scratch user per file,
// to stay under Supabase Auth's sign-in rate limit (see co_owner_access).
//
// RESET_REDIRECT_BASE defaults to dev's app address. To check staging/prod
// by hand, pass that project's URL/keys and its app address.
//
// Run: deno test --allow-net --allow-env --node-modules-dir=none supabase/tests/password_reset_redirect.test.ts

import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { adminClient, createScratchUser, deleteScratchUser } from '../functions/_shared/testHelpers.ts';

const APP_BASE = (Deno.env.get('RESET_REDIRECT_BASE') ?? 'http://localhost:5173').replace(/\/$/, '');
const RESET_URL = `${APP_BASE}/reset-password`;

Deno.test('a password-reset link redirects to /reset-password with a recovery login', async () => {
  const user = await createScratchUser('reset-redirect');
  try {
    const { data, error } = await adminClient().auth.admin.generateLink({
      type: 'recovery',
      email: user.email,
      options: { redirectTo: RESET_URL },
    });
    assertEquals(error, null, `generateLink failed: ${error?.message}`);
    const actionLink = data?.properties?.action_link;
    assert(actionLink, 'generateLink returned no action_link');

    // Supabase's verify endpoint answers with a redirect; read it, don't follow it.
    const res = await fetch(actionLink, { redirect: 'manual' });
    await res.body?.cancel();
    assert(res.status >= 300 && res.status < 400, `expected a redirect, got HTTP ${res.status}`);
    const location = res.headers.get('location') ?? '';

    assert(
      location.startsWith(RESET_URL),
      `reset link goes to "${location.split('#')[0]}" instead of ${RESET_URL}. ` +
        `Add ${RESET_URL} to this project's Supabase Redirect URLs (see 0006 Technical Standards §11).`,
    );
    // The login token travels after '#'; type=recovery is what makes the
    // browser announce PASSWORD_RECOVERY.
    assert(location.includes('type=recovery'), 'redirect carries no recovery login');
  } finally {
    await deleteScratchUser(user.userId);
  }
});
