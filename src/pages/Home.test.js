import { describe, it, expect, vi } from 'vitest';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';

// Home's welcome screen (spec 0079, AC2/AC2b). Vitest runs in a plain
// Node environment, so this renders to an HTML string with
// react-dom/server. Home.jsx's imports touch `window` and the Supabase
// client at load time, so both are stubbed; nothing here talks to a
// database.
vi.mock('@/api/supabaseClient', () => ({ supabase: {} }));
vi.mock('@/api/entities', () => ({ entities: {} }));
globalThis.window ??= /** @type {any} */ (globalThis);
// vitest.config.js has no React plugin, so .jsx compiles to the classic
// React.createElement calls; give them a React to find.
/** @type {any} */ (globalThis).React = React;

const { HomeWelcome } = await import('./Home.jsx');
const { default: ListRow } = await import('@/components/ListRow.jsx');
const { PawPrint } = await import('lucide-react');

// The subtitle's <p> (the one carrying the subtitle text), so the title's
// own `truncate` never counts.
const subtitleClass = (html, text) => {
  const m = html.match(new RegExp(`<p class="([^"]*)">${text}</p>`));
  if (!m) throw new Error(`subtitle "${text}" not found in ${html}`);
  return m[1].split(/\s+/);
};

const render = (sitterOnlyCount) =>
  renderToStaticMarkup(
    createElement(MemoryRouter, null, createElement(HomeWelcome, { sitterOnlyCount })),
  );

describe('HomeWelcome', () => {
  // AC2b: no pets and sits for nobody → today's welcome screen, no card.
  it('shows the welcome screen with no Pet Sitter card when the person sits for nobody', () => {
    const html = render(0);
    expect(html).toContain('Welcome to Wysker Watch');
    expect(html).toContain('Add Pet');
    expect(html).not.toContain('Pet Sitter');
    expect(html).not.toContain('href="/pet-sitter"');
  });

  // AC2 (render side; the e2e test covers it for test4@ on dev).
  it('adds the Pet Sitter card linking to /pet-sitter when the person sits for others’ pets', () => {
    const html = render(2);
    expect(html).toContain('Welcome to Wysker Watch');
    expect(html).toContain('Pet Sitter');
    expect(html).toContain('See the pets you&#x27;re sitting');
    expect(html).toContain('href="/pet-sitter"');
    expect(html).not.toContain('Manage sitting periods and sitter access');
    // The title and subtitle are inside the one link to /pet-sitter.
    expect(html).toMatch(/<a [^>]*href="\/pet-sitter"[^>]*>(?:(?!<\/a>).)*Pet Sitter(?:(?!<\/a>).)*See the pets you&#x27;re sitting(?:(?!<\/a>).)*<\/a>/s);
  });
});

// Spec 0079 FR3 (Lynn's build decision): ListRow's subtitle may opt in to
// wrapping instead of being cut off with "…"; every other caller keeps
// today's truncation.
describe('ListRow wrapSubtitle', () => {
  const row = (props) =>
    renderToStaticMarkup(
      createElement(MemoryRouter, null,
        createElement(ListRow, { to: '/x', icon: PawPrint, title: 'Title', subtitle: 'A long subtitle', ...props })),
    );

  it('still truncates the subtitle by default', () => {
    expect(subtitleClass(row({}), 'A long subtitle')).toContain('truncate');
  });

  it('lets the subtitle wrap, with no truncation, when wrapSubtitle is set', () => {
    const cls = subtitleClass(row({ wrapSubtitle: true }), 'A long subtitle');
    expect(cls).not.toContain('truncate');
    expect(cls.some((c) => /^(text-ellipsis|overflow-hidden|whitespace-nowrap|line-clamp)/.test(c))).toBe(false);
  });

  it("the Pet Sitter card's subtitle wraps instead of truncating", () => {
    const html = render(2);
    expect(subtitleClass(html, 'See the pets you&#x27;re sitting')).not.toContain('truncate');
  });
});
