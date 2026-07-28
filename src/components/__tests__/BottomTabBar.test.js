import { describe, it, expect } from 'vitest';
import { tabs } from '../BottomTabBar';

// Every route in the app must resolve to exactly one active bottom tab —
// zero (a route with no highlighted destination) or more than one (two
// tabs lit up at once) are both bugs. Covers the spec 0023 additions
// (/pet-sitter marks Home active) alongside the pre-existing routes.
function activeTabsFor(pathname) {
  return tabs.filter((t) => t.isActive(pathname)).map((t) => t.label);
}

describe('BottomTabBar active-tab logic', () => {
  it.each([
    ['/', ['Home']],
    ['/pet-sitter', ['Home']],
    ['/pets', ['Pets']],
    ['/pet/abc123', ['Pets']],
    ['/pet/abc123/trends', ['Pets']],
    ['/pet/abc123/timeline', ['Pets']],
    ['/pet/abc123/profile', ['Pets']],
    ['/pet/abc123/export', ['Pets']],
    ['/settings', ['Menu']],
    ['/account', ['Menu']],
    ['/notifications', ['Menu']],
    ['/about', ['Menu']],
    ['/privacy', ['Menu']],
    ['/privacy/some-section', ['Menu']],
    ['/terms', ['Menu']],
    ['/preferences', ['Menu']],
    ['/support', ['Menu']],
  ])('%s activates %j', (pathname, expected) => {
    expect(activeTabsFor(pathname)).toEqual(expected);
  });

  it('never activates more than one tab for any route in the table above', () => {
    const paths = ['/', '/pet-sitter', '/pets', '/pet/abc123/trends', '/settings', '/account', '/privacy/some-section'];
    for (const p of paths) {
      expect(activeTabsFor(p).length).toBeLessThanOrEqual(1);
    }
  });
});
