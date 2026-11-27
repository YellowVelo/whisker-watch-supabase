import { describe, it, expect } from 'vitest';
import { isLegalPath, legalPageWithoutShell, shouldShowConsentGate } from './consentGate';

// When the consent screen replaces a page (spec 0086 FR6, AC10, AC12).
const signedIn = (user, extra = {}) => ({
  isAuthenticated: true,
  user,
  profileLoadError: false,
  pathname: '/',
  ...extra,
});

describe('isLegalPath', () => {
  it.each(['/terms', '/terms/', '/terms/section-3', '/privacy', '/privacy/', '/privacy/your-rights'])('%s is a legal page', (p) => {
    expect(isLegalPath(p)).toBe(true);
  });

  it.each(['/', '/pets', '/terms-and-more', '/privacyx', '/terms/a/b', '/pet/terms', '', null, undefined])('%s is not', (p) => {
    expect(isLegalPath(p)).toBe(false);
  });
});

describe('shouldShowConsentGate', () => {
  it('shows when the profile loaded with no consent', () => {
    expect(shouldShowConsentGate(signedIn({ id: 'u', terms_accepted_at: null }))).toBe(true);
    expect(shouldShowConsentGate(signedIn({ id: 'u' }))).toBe(true);
  });

  it('does not show when consent is on record', () => {
    expect(shouldShowConsentGate(signedIn({ id: 'u', terms_accepted_at: '2026-11-27T00:00:00Z' }))).toBe(false);
  });

  it('does not show when the profile failed to load', () => {
    expect(shouldShowConsentGate(signedIn({ id: 'u', terms_accepted_at: null }, { profileLoadError: true }))).toBe(false);
  });

  it('does not show when signed out or with no user', () => {
    expect(shouldShowConsentGate(signedIn({ id: 'u' }, { isAuthenticated: false }))).toBe(false);
    expect(shouldShowConsentGate(signedIn(null))).toBe(false);
  });

  it.each(['/terms', '/terms/x', '/privacy', '/privacy/x'])('does not show on %s', (pathname) => {
    expect(shouldShowConsentGate(signedIn({ id: 'u', terms_accepted_at: null }, { pathname }))).toBe(false);
  });
});

describe('legalPageWithoutShell', () => {
  const noConsent = { id: 'u', terms_accepted_at: null };

  it.each(['/terms', '/terms/x', '/privacy', '/privacy/x'])('is true on %s for someone with no consent', (pathname) => {
    expect(legalPageWithoutShell(signedIn(noConsent, { pathname }))).toBe(true);
  });

  it('is false off the legal pages (the consent screen shows there instead)', () => {
    expect(legalPageWithoutShell(signedIn(noConsent, { pathname: '/' }))).toBe(false);
    expect(legalPageWithoutShell(signedIn(noConsent, { pathname: '/pets' }))).toBe(false);
  });

  it('is false with consent on record, a failed profile load, or no session', () => {
    expect(legalPageWithoutShell(signedIn({ id: 'u', terms_accepted_at: '2026-11-27T00:00:00Z' }, { pathname: '/terms' }))).toBe(false);
    expect(legalPageWithoutShell(signedIn(noConsent, { pathname: '/terms', profileLoadError: true }))).toBe(false);
    expect(legalPageWithoutShell(signedIn(noConsent, { pathname: '/terms', isAuthenticated: false }))).toBe(false);
    expect(legalPageWithoutShell(signedIn(null, { pathname: '/terms' }))).toBe(false);
  });
});
