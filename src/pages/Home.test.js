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
