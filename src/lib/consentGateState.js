// The consent screen's state machine (src/components/ConsentGate.jsx,
// spec 0086 FR6). Pure, so every transition can be unit-tested; kept out
// of consentGate.js so the route rule doesn't load the Supabase client.

import { setupScreenFor } from '@/lib/accountSetup';

/**
 * The consent screen's state machine (ConsentGate.jsx). `screen` is what
 * it shows; `action` is the side effect the component runs next, and
 * `seq` changes whenever there is a new one, so each runs once.
 *   check     ask finish-account-setup (status)
 *   refresh   refresh the profile (the page shows meanwhile)
 *   redirect  full-page load to /login
 *   reload    reload the page (the profile refresh failed)
 *
 * @typedef {'loading' | 'finish' | 'consentOnly' | 'error' | 'done'} GateScreen
 * @typedef {'check' | 'refresh' | 'redirect' | 'reload' | null} GateAction
 * @typedef {{ screen: GateScreen, action: GateAction, seq: number }} GateState
 * @typedef {{ type: 'status', status: any } | { type: 'finished' } | { type: 'signedOut' } | { type: 'retry' } | { type: 'refreshFailed' }} GateEvent
 */

/** @type {GateState} */
export const INITIAL_GATE_STATE = { screen: 'loading', action: 'check', seq: 0 };

/**
 * @param {GateState} prev
 * @param {GateScreen} screen
 * @param {GateAction} action
 * @returns {GateState}
 */
const go = (prev, screen, action) => ({ screen, action, seq: action ? prev.seq + 1 : prev.seq });

/**
 * @param {GateState} prev
 * @param {GateEvent} event
 * @returns {GateState}
 */
export function nextGateState(prev, event) {
  switch (event.type) {
    case 'status': {
      // Only the answer to a check that is still showing the spinner counts.
      if (prev.screen !== 'loading') return prev;
      const next = setupScreenFor(event.status);
      if (next === 'signedOut') return go(prev, 'loading', 'redirect');
      if (next === 'skip') return go(prev, 'done', 'refresh');
      return go(prev, next, null);
    }
    case 'finished':
      if (prev.screen !== 'finish' && prev.screen !== 'consentOnly') return prev;
      return go(prev, 'done', 'refresh');
    case 'signedOut':
      return go(prev, prev.screen, 'redirect');
    case 'retry':
      if (prev.screen !== 'error') return prev;
      return go(prev, 'loading', 'check');
    case 'refreshFailed':
      return go(prev, prev.screen, 'reload');
    default:
      return prev;
  }
}
