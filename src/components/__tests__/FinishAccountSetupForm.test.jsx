import { describe, it, expect, vi } from 'vitest';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';

// FinishAccountSetupForm (spec 0086). Vitest runs in plain Node, so this
// renders to an HTML string and checks the form's states and approved
// copy. accountSetup.js is stubbed so nothing calls the server.
vi.mock('@/lib/accountSetup', () => ({
  finishAccountSetup: vi.fn(),
  getAccountSetupStatus: vi.fn(),
}));
/** @type {any} */ (globalThis).React = React;
// src/lib/utils.js (imported by the ui primitives) reads window at load time.
if (typeof globalThis.window === 'undefined') {
  /** @type {any} */ (globalThis).window = { self: globalThis, top: globalThis };
}

const { default: FinishAccountSetupForm } = await import('../FinishAccountSetupForm.jsx');
const { default: SetPasswordForm } = await import('../SetPasswordForm.jsx');

const render = (props) =>
  renderToStaticMarkup(
    createElement(MemoryRouter, null, createElement(FinishAccountSetupForm, { onSuccess: () => {}, ...props })),
  );

const TERMS_TEXT = 'I agree to the <a';
const MARKETING_TEXT = 'Send me tips, product updates, and other marketing communications.';

describe('FinishAccountSetupForm', () => {
  it('shows Password and Confirm Password when a password is needed', () => {
    const html = render({ needsPassword: true, showMarketing: true });
    expect(html).toContain('>Password</label>');
    expect(html).toContain('>Confirm Password</label>');
    expect((html.match(/type="password"/g) ?? []).length).toBe(2);
  });

  it('has no password fields when no password is needed (consent-only screen)', () => {
    const html = render({ needsPassword: false, showMarketing: false });
    expect(html).not.toContain('type="password"');
    expect(html).not.toContain('Confirm Password');
  });

  it('shows the approved Terms checkbox text, with Terms and Privacy links opening in a new tab', () => {
    const html = render({ needsPassword: false, showMarketing: false });
    expect(html).toContain(TERMS_TEXT);
    expect(html).toMatch(/<a[^>]*href="\/terms"[^>]*target="_blank"[^>]*>Terms of Service<\/a>/);
    expect(html).toMatch(/<a[^>]*href="\/privacy"[^>]*target="_blank"[^>]*>Privacy Policy<\/a>/);
    expect(html).toContain('rel="noopener noreferrer"');
    const plain = html.replace(/<[^>]+>/g, '');
    expect(plain).toContain('I agree to the Terms of Service and Privacy Policy.');
  });

  it('shows the marketing checkbox only when asked to', () => {
    expect(render({ needsPassword: true, showMarketing: true })).toContain(MARKETING_TEXT);
    expect(render({ needsPassword: false, showMarketing: false })).not.toContain(MARKETING_TEXT);
  });

  it('keeps the checkbox rows at the 44px tap height', () => {
    const html = render({ needsPassword: false, showMarketing: true });
    expect((html.match(/min-h-11/g) ?? []).length).toBe(2);
  });

  it('starts with the button disabled because Terms is not ticked yet', () => {
    const html = render({ needsPassword: true, showMarketing: true, submitLabel: 'Finish' });
    expect(html).toMatch(/<button[^>]*type="submit"[^>]*disabled=""[^>]*>Finish<\/button>/);
  });

  it('uses the given button label (Continue) and defaults to Finish', () => {
    expect(render({ needsPassword: false, showMarketing: false, submitLabel: 'Continue' })).toContain('>Continue</button>');
    expect(render({ needsPassword: false, showMarketing: false })).toContain('>Finish</button>');
  });
});

describe('SetPasswordForm still renders its two password fields (shared PasswordFields)', () => {
  it('renders Password, Confirm Password and its own button', () => {
    const html = renderToStaticMarkup(createElement(SetPasswordForm, { onSuccess: () => {} }));
    expect((html.match(/type="password"/g) ?? []).length).toBe(2);
    expect(html).toContain('>Password</label>');
    expect(html).toContain('>Confirm Password</label>');
    expect(html).toContain('>Set Password</button>');
  });
});
