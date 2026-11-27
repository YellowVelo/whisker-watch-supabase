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
// The consent screen itself is tested in ConsentGate.test.jsx; here it is
// a marker, so these tests check only when the routes show it.
vi.mock('@/components/ConsentGate', () => ({
  default: () => createElement('p', null, 'CONSENT-GATE'),
}));
/** @type {any} */ (globalThis).React = React;

const { default: ProtectedRoute } = await import('../ProtectedRoute.jsx');
const { default: AdminRoute } = await import('../AdminRoute.jsx');

const PAGE_PATHS = ['/', '/terms', '/terms/:sectionId', '/privacy', '/privacy/:sectionId', '/pets'];

const render = (path = '/') =>
  renderToStaticMarkup(
    createElement(
      MemoryRouter,
      { initialEntries: [path] },
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
          ...PAGE_PATHS.map((p) => createElement(Route, { key: p, path: p, element: createElement('p', null, 'PAGE') })),
        ),
      ),
    ),
  );

const renderAdmin = () =>
  renderToStaticMarkup(
    createElement(
      MemoryRouter,
      { initialEntries: ['/admin/beta-signups'] },
      createElement(
        Routes,
        null,
        createElement(
          Route,
          { element: createElement(AdminRoute) },
          createElement(Route, { path: '/admin/beta-signups', element: createElement('p', null, 'ADMIN-PAGE') }),
        ),
        createElement(Route, { path: '/', element: createElement('p', null, 'HOME') }),
        createElement(Route, { path: '/login', element: createElement('p', null, 'LOGIN') }),
      ),
    ),
  );

const base = {
  isAuthenticated: false,
  isLoadingAuth: false,
  authChecked: true,
  authError: null,
  profileLoadError: false,
  user: null,
  checkUserAuth: () => {},
};

const CONSENTED = { id: 'u1', role: 'user', terms_accepted_at: '2026-11-27T00:00:00Z' };
const NO_CONSENT = { id: 'u1', role: 'user', terms_accepted_at: null };

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
    authState = { ...base, isAuthenticated: true, user: CONSENTED };
    const html = render();
    expect(html).toContain('PAGE');
    expect(html).toContain('data-shell="yes"');
  });
});

describe('ProtectedRoute consent gate (spec 0086 FR6, AC10, AC12)', () => {
  it('shows the consent screen instead of the page when the profile loaded with no consent', () => {
    authState = { ...base, isAuthenticated: true, user: NO_CONSENT };
    for (const path of ['/', '/pets']) {
      const html = render(path);
      expect(html).toContain('CONSENT-GATE');
      expect(html).not.toContain('PAGE');
    }
  });

  it.each(['/terms', '/terms/data-we-collect', '/privacy', '/privacy/your-rights'])(
    'shows %s itself, not the consent screen (AC12)',
    (path) => {
      authState = { ...base, isAuthenticated: true, user: NO_CONSENT };
      const html = render(path);
      expect(html).toContain('PAGE');
      expect(html).not.toContain('CONSENT-GATE');
    },
  );

  it.each(['/terms', '/terms/data-we-collect', '/privacy', '/privacy/your-rights'])(
    'shows %s without the App Shell (no header, Ask Wysker or notifications) to someone with no consent',
    (path) => {
      authState = { ...base, isAuthenticated: true, user: NO_CONSENT };
      const html = render(path);
      expect(html).toBe('<p>PAGE</p>');
      expect(html).not.toContain('data-shell');
    },
  );

  it.each(['/terms', '/privacy/your-rights'])('still shows %s inside the App Shell once consent is on record', (path) => {
    authState = { ...base, isAuthenticated: true, user: CONSENTED };
    const html = render(path);
    expect(html).toContain('PAGE');
    expect(html).toContain('data-shell="yes"');
  });

  it('keeps the App Shell on legal pages when the profile failed to load', () => {
    authState = { ...base, isAuthenticated: true, profileLoadError: true, user: { id: 'u1', role: 'user' } };
    expect(render('/terms')).toContain('data-shell="yes"');
  });

  it('stays out of the way when the profile failed to load (profileLoadError)', () => {
    authState = { ...base, isAuthenticated: true, profileLoadError: true, user: { id: 'u1', email: 'a@b.c', role: 'user' } };
    const html = render('/');
    expect(html).toContain('PAGE');
    expect(html).not.toContain('CONSENT-GATE');
  });

  it('shows the page when consent is on record', () => {
    authState = { ...base, isAuthenticated: true, user: CONSENTED };
    const html = render('/');
    expect(html).toContain('PAGE');
    expect(html).not.toContain('CONSENT-GATE');
  });

  it('does not show the consent screen to someone signed out (legal pages stay public)', () => {
    authState = { ...base };
    const html = render('/');
    expect(html).toContain('SIGNED-OUT');
    expect(html).not.toContain('CONSENT-GATE');
  });
});

describe('AdminRoute consent gate (spec 0086 FR6)', () => {
  it('shows the consent screen to an admin with no consent', () => {
    authState = { ...base, isAuthenticated: true, user: { ...NO_CONSENT, role: 'admin' } };
    const html = renderAdmin();
    expect(html).toContain('CONSENT-GATE');
    expect(html).not.toContain('ADMIN-PAGE');
  });

  it('shows the admin page to an admin with consent', () => {
    authState = { ...base, isAuthenticated: true, user: { ...CONSENTED, role: 'admin' } };
    const html = renderAdmin();
    expect(html).toContain('ADMIN-PAGE');
    expect(html).not.toContain('CONSENT-GATE');
  });

  it('stays out of the way for an admin whose profile failed to load', () => {
    authState = { ...base, isAuthenticated: true, profileLoadError: true, user: { id: 'u1', role: 'admin' } };
    expect(renderAdmin()).not.toContain('CONSENT-GATE');
  });

  // <Navigate> redirects in an effect, which a static render doesn't run,
  // so this checks only that neither the page nor the gate is shown here.
  it('still redirects a non-admin with no consent instead of gating the admin route', () => {
    authState = { ...base, isAuthenticated: true, user: NO_CONSENT };
    const html = renderAdmin();
    expect(html).not.toContain('ADMIN-PAGE');
    expect(html).not.toContain('CONSENT-GATE');
  });
});
