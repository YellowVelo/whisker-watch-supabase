import { describe, it, expect } from 'vitest';
import { shouldRedirectToReset, RESET_PASSWORD_PATH } from '../passwordRecovery';

// Spec 0074: a reset-link login must always end on Set New Password, even
// if Supabase's Redirect URLs setting drops someone on another page.
describe('shouldRedirectToReset', () => {
  it('redirects a reset-link login that landed on Home', () => {
    expect(shouldRedirectToReset('PASSWORD_RECOVERY', '/')).toBe(true);
  });

  it('redirects a reset-link login that landed on any other page', () => {
    expect(shouldRedirectToReset('PASSWORD_RECOVERY', '/pets')).toBe(true);
    expect(shouldRedirectToReset('PASSWORD_RECOVERY', '/login')).toBe(true);
  });

  it('does nothing when already on the reset page', () => {
    expect(shouldRedirectToReset('PASSWORD_RECOVERY', RESET_PASSWORD_PATH)).toBe(false);
  });

  it.each(['SIGNED_IN', 'INITIAL_SESSION', 'TOKEN_REFRESHED', 'USER_UPDATED', 'SIGNED_OUT'])(
    'ignores the %s event',
    (event) => {
      expect(shouldRedirectToReset(event, '/')).toBe(false);
    },
  );
});
