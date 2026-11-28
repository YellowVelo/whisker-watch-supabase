import { describe, it, expect, vi } from 'vitest';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';

// Register (spec 0086 AC1): name and email only, no password fields, no
// Terms checkbox, and the approved line about what happens after the
// email. Vitest runs in plain Node, so this renders to an HTML string.
vi.mock('@/api/supabaseClient', () => ({
  supabase: { functions: { invoke: vi.fn() }, auth: { signInWithOAuth: vi.fn() } },
}));
/** @type {any} */ (globalThis).React = React;
// src/lib/utils.js (imported by the ui primitives) reads window at load time.
if (typeof globalThis.window === 'undefined') {
  /** @type {any} */ (globalThis).window = { self: globalThis, top: globalThis };
}

const { default: Register } = await import('./Register.jsx');

const html = renderToStaticMarkup(createElement(MemoryRouter, null, createElement(Register)));
const plain = html.replace(/<[^>]+>/g, '').replace(/&#x27;/g, "'");

describe('Register (spec 0086)', () => {
  it('asks only for First Name and Email', () => {
    expect(html).toContain('>First Name</label>');
    expect(html).toContain('>Email</label>');
    expect(html).not.toContain('type="password"');
    expect(html).not.toContain('Confirm Password');
  });

  it('has no checkboxes (Terms and marketing moved to the finish page)', () => {
    expect(html).not.toContain('role="checkbox"');
    expect(plain).not.toContain('I agree to the');
    expect(plain).not.toContain('marketing communications');
  });

  it('does not disable Sign Up behind a checkbox', () => {
    expect(html).toMatch(/<button[^>]*type="submit"[^>]*>Sign Up<\/button>/);
    expect(html).not.toMatch(/<button[^>]*type="submit"[^>]*disabled=""[^>]*>Sign Up<\/button>/);
  });

  it('shows the approved line with Terms and Privacy links opening in a new tab', () => {
    expect(plain).toContain(
      "After you confirm your email, you'll create a password and review our Terms of Service and Privacy Policy.",
    );
    expect(html).toMatch(/<a[^>]*href="\/terms"[^>]*target="_blank"[^>]*>Terms of Service<\/a>/);
    expect(html).toMatch(/<a[^>]*href="\/privacy"[^>]*target="_blank"[^>]*>Privacy Policy<\/a>/);
  });
});
