import { describe, it, expect } from 'vitest';
import { TOS_LAST_UPDATED } from './termsOfServiceContent';
import { PRIVACY_POLICY_LAST_UPDATED } from './privacyPolicyContent';
import { TOS_VERSION, PRIVACY_VERSION } from '../../supabase/functions/_shared/legalVersions.ts';

// Spec 0086: the server records which Terms and Privacy versions a person
// agreed to, from its own copy of the dates (Edge Functions can't import
// the app's files). These fail the moment the two copies differ, which is
// how the server came to record "November 20" while the live Privacy
// Policy said "November 21". Fix by updating both copies, never this test.

describe('app/server parity: legal document versions (spec 0086)', () => {
  it("records the live Terms of Service's Last updated date", () => {
    expect(TOS_VERSION).toBe(TOS_LAST_UPDATED);
  });

  it("records the live Privacy Policy's Last updated date", () => {
    expect(PRIVACY_VERSION).toBe(PRIVACY_POLICY_LAST_UPDATED);
  });

  it('both versions are non-empty dates', () => {
    for (const v of [TOS_VERSION, PRIVACY_VERSION]) {
      expect(typeof v).toBe('string');
      expect(Number.isNaN(Date.parse(v))).toBe(false);
    }
  });
});
