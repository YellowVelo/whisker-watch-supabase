import { describe, it, expect, vi } from 'vitest';

// The consent screen's transitions (spec 0086 FR6, AC10, AC11):
// nextGateState() in consentGateState.js, which ConsentGate.jsx runs.
vi.mock('@/api/supabaseClient', () => ({ supabase: {} }));

const { INITIAL_GATE_STATE, nextGateState } = await import('./consentGateState');

const loading = INITIAL_GATE_STATE;
const at = (screen, seq = 1) => ({ screen, action: null, seq });
const status = (s) => ({ type: 'status', status: s });

describe('nextGateState', () => {
  it('starts on the spinner, asking status', () => {
    expect(loading).toEqual({ screen: 'loading', action: 'check', seq: 0 });
  });

  describe('status result -> screen', () => {
    it('an email-link session that needs a password -> finish', () => {
      expect(nextGateState(loading, status({ ok: true, needsPassword: true, needsConsent: true }))).toEqual({ screen: 'finish', action: null, seq: 0 });
    });

    it('a password session with no consent -> consentOnly', () => {
      expect(nextGateState(loading, status({ ok: true, needsPassword: false, needsConsent: true }))).toEqual({ screen: 'consentOnly', action: null, seq: 0 });
    });

    it('nothing left to do (stale profile) -> the page, and the profile is refreshed', () => {
      expect(nextGateState(loading, status({ ok: true, needsPassword: false, needsConsent: false }))).toEqual({ screen: 'done', action: 'refresh', seq: 1 });
    });

    it('the session is gone -> redirect to /login, spinner stays', () => {
      expect(nextGateState(loading, status({ ok: false, signedOut: true }))).toEqual({ screen: 'loading', action: 'redirect', seq: 1 });
    });

    it('any other failure -> error', () => {
      expect(nextGateState(loading, status({ ok: false, error: 'x' }))).toEqual({ screen: 'error', action: null, seq: 0 });
      expect(nextGateState(loading, status(undefined))).toEqual({ screen: 'error', action: null, seq: 0 });
    });

    it('ignores a status answer once off the spinner', () => {
      const prev = at('consentOnly');
      expect(nextGateState(prev, status({ ok: true, needsPassword: true }))).toBe(prev);
    });
  });

  it.each(['finish', 'consentOnly'])('finishing on %s -> the page, and the profile is refreshed', (screen) => {
    expect(nextGateState(at(screen, 3), { type: 'finished' })).toEqual({ screen: 'done', action: 'refresh', seq: 4 });
  });

  it('ignores finished from any other screen', () => {
    const prev = at('error');
    expect(nextGateState(prev, { type: 'finished' })).toBe(prev);
  });

  it('the form reporting the session gone -> redirect to /login', () => {
    expect(nextGateState(at('finish', 2), { type: 'signedOut' })).toEqual({ screen: 'finish', action: 'redirect', seq: 3 });
  });

  it('Try again from the error screen -> spinner and a new status check', () => {
    const errored = nextGateState(loading, status({ ok: false }));
    const retried = nextGateState(errored, { type: 'retry' });
    expect(retried).toEqual({ screen: 'loading', action: 'check', seq: 1 });
    expect(nextGateState(retried, status({ ok: true, needsPassword: false, needsConsent: true })).screen).toBe('consentOnly');
  });

  it('ignores retry anywhere but the error screen', () => {
    for (const prev of [loading, at('finish'), at('consentOnly'), at('done')]) {
      expect(nextGateState(prev, { type: 'retry' })).toBe(prev);
    }
  });

  it('a failed profile refresh after finishing -> reload', () => {
    const done = nextGateState(at('consentOnly', 1), { type: 'finished' });
    expect(nextGateState(done, { type: 'refreshFailed' })).toEqual({ screen: 'done', action: 'reload', seq: 3 });
  });

  it('each new action gets a new seq, so the component runs it once', () => {
    const a = nextGateState(loading, status({ ok: false }));
    const b = nextGateState(a, { type: 'retry' });
    const c = nextGateState(b, status({ ok: true, needsPassword: false, needsConsent: false }));
    expect(new Set([loading.seq, b.seq, c.seq]).size).toBe(3);
  });
});
