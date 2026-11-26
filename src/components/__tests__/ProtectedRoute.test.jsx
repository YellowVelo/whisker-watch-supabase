import { describe, it, expect, vi, beforeEach } from 'vitest';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

// ProtectedRoute's sign-in gate (spec 0081 FR19). Vitest runs in plain
// Node, so this renders to an HTML string. useAuth() is stubbed per test,
// and AppShell is stubbed so its data loading never runs.
let authState;
vi.mock('@/lib/AuthContext', () => ({ useAuth: () => authState }));
vi.mock('@/components/AppShell', () => ({
  default: ({ children }) => createElement('div', { 'data-shell': 'yes' }, children),
}));
/** @type {any} */ (globalThis).React = React;

const { default: ProtectedRoute } = await import('../ProtectedRoute.jsx');

const render = () =>
  renderToStaticMarkup(
    createElement(
      MemoryRouter,
      { initialEntries: ['/'] },
      createElement(
        Routes,
        null,
        createElement(
          Route,
          {
            element: createElement(ProtectedRoute, {
              fallback: createElement('p', null, 'LOADING'),
              unauthenticatedElement: createElement('p', null, 'SIGNED-OUT'),
            }),
          },
          createElement(Route, { path: '/', element: createElement('p', null, 'PAGE') }),
        ),
      ),
    ),
  );

const base = {
  isAuthenticated: false,
  isLoadingAuth: false,
  authChecked: true,
  authError: null,
  checkUserAuth: () => {},
};

describe('ProtectedRoute', () => {
  beforeEach(() => {
    authState = { ...base };
  });

  it('shows the fallback while the session check is running', () => {
    authState = { ...base, isLoadingAuth: true, authChecked: false };
    expect(render()).toContain('LOADING');
  });

  it('shows the signed-out element when there is no session', () => {
    expect(render()).toContain('SIGNED-OUT');
  });

  it("treats authError 'unknown' like being signed out", () => {
    authState = { ...base, authError: { type: 'unknown', message: 'boom' } };
    const html = render();
    expect(html).toContain('SIGNED-OUT');
    expect(html).not.toContain('PAGE');
  });

  it('has no separate "not registered" screen: any authError type goes to the signed-out element', () => {
    authState = { ...base, isAuthenticated: true, authError: { type: 'user_not_registered' } };
    const html = render();
    expect(html).toContain('SIGNED-OUT');
    expect(html).not.toContain('Access Restricted');
  });

  it('shows the page inside the App Shell when signed in', () => {
    authState = { ...base, isAuthenticated: true };
    const html = render();
    expect(html).toContain('PAGE');
    expect(html).toContain('data-shell="yes"');
  });
});
