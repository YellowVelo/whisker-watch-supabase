import { describe, it, expect, vi } from 'vitest';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';

// ConsentGate's screens (spec 0086 FR6, AC10, AC11). Vitest runs in plain
// Node, so this renders to an HTML string: ConsentGateScreen is rendered
// for each screen setupScreenFor() can pick, and ConsentGate itself only
// for its first render (effects, and so the status call, don't run here).
// accountSetup.js's server calls and useAuth() are stubbed.
const getAccountSetupStatus = vi.fn();
vi.mock('@/lib/accountSetup', async () => {
  const real = await vi.importActual('@/lib/accountSetup');
  return { ...real, getAccountSetupStatus, finishAccountSetup: vi.fn() };
});
vi.mock('@/api/supabaseClient', () => ({ supabase: {} }));
vi.mock('@/lib/AuthContext', () => ({ useAuth: () => ({ logout: () => {}, refreshProfile: async () => {} }) }));
/** @type {any} */ (globalThis).React = React;
// src/lib/utils.js (imported by the ui primitives) reads window at load time.
if (typeof globalThis.window === 'undefined') {
  /** @type {any} */ (globalThis).window = { self: globalThis, top: globalThis };
}

const { default: ConsentGate, ConsentGateScreen } = await import('../ConsentGate.jsx');

const renderScreen = (screen) =>
  renderToStaticMarkup(
    createElement(MemoryRouter, null, createElement(ConsentGateScreen, { screen, onSuccess: () => {}, onSignedOut: () => {} })),
  );

const SIGN_OUT = />Sign out<\/button>/;
const MARKETING_TEXT = 'Send me tips, product updates, and other marketing communications.';

describe('ConsentGate first render', () => {
  it('shows a spinner, not the page, until status returns', () => {
    const html = renderToStaticMarkup(
      createElement(MemoryRouter, null, createElement(ConsentGate, null, createElement('p', null, 'PAGE'))),
    );
    expect(html).toContain('data-consent-gate="loading"');
    expect(html).not.toContain('PAGE');
    expect(html).not.toContain('<form');
  });
});

describe('ConsentGateScreen consentOnly (password session, AC10/AC11)', () => {
  const html = renderScreen('consentOnly');

  it('shows the approved title and body', () => {
    expect(html).toContain('One quick thing before you continue');
    expect(html).toContain('We need your OK on our Terms of Service and Privacy Policy. It only takes a moment.');
  });

  it('asks for Terms only: no password fields, no marketing checkbox', () => {
    expect(html).not.toContain('type="password"');
    expect(html).not.toContain(MARKETING_TEXT);
    expect(html.replace(/<[^>]+>/g, '')).toContain('I agree to the Terms of Service and Privacy Policy.');
  });

  it('has Continue (disabled until Terms is ticked) and an outline Sign out', () => {
    expect(html).toMatch(/<button[^>]*type="submit"[^>]*disabled=""[^>]*>Continue<\/button>/);
    expect(html).toMatch(SIGN_OUT);
    expect(html).toMatch(/<button class="[^"]*border-input[^"]*" type="button">Sign out<\/button>/);
  });
});

describe('ConsentGateScreen finish (email-link session, AC11)', () => {
  const html = renderScreen('finish');

  it('is the "Finish setting up your account" page', () => {
    expect(html).toContain('Finish setting up your account');
    expect(html).toContain('Create a password and review our terms to start using Wysker Watch.');
    expect(html).toMatch(/<button[^>]*type="submit"[^>]*disabled=""[^>]*>Finish<\/button>/);
  });

  it('asks for a password, Terms and marketing, like /verify-email', () => {
    expect((html.match(/type="password"/g) ?? []).length).toBe(2);
    expect(html).toContain(MARKETING_TEXT);
  });
});

describe('ConsentGateScreen error', () => {
  it('shows the generic error with Sign out, so it is not a dead end', () => {
    const html = renderScreen('error');
    expect(html).toContain('Something went wrong. Please try again.');
    expect(html).toMatch(SIGN_OUT);
    expect(html).not.toContain('<form');
  });
});

describe('ConsentGateScreen loading', () => {
  it('shows only the spinner', () => {
    const html = renderScreen('loading');
    expect(html).toContain('data-consent-gate="loading"');
    expect(html).not.toMatch(SIGN_OUT);
  });
});
