import { describe, it, expect } from 'vitest';
import { getPetContext } from '../petScreenContext';

// Ask Wysker's pet/screen context is re-derived from the URL every time the
// header button is tapped (spec 0023 step 5/10). Wrong output here means
// the AI sheet opens with the wrong pet, or silently loses pet context it
// should have had.
describe('getPetContext', () => {
  it.each([
    ['/', { petId: null, screen: null }],
    ['/pets', { petId: null, screen: null }],
    ['/settings', { petId: null, screen: null }],
    ['/pet-sitter', { petId: null, screen: null }],
    ['/pet/abc123', { petId: 'abc123', screen: 'Overview' }],
    ['/pet/abc123/trends', { petId: 'abc123', screen: 'Trends' }],
    ['/pet/abc123/timeline', { petId: 'abc123', screen: 'Timeline' }],
    ['/pet/abc123/symptoms', { petId: 'abc123', screen: 'Weight' }],
    ['/pet/abc123/food', { petId: 'abc123', screen: 'Food' }],
    ['/pet/abc123/export', { petId: 'abc123', screen: 'Vet Export' }],
    ['/pet/abc123/profile', { petId: 'abc123', screen: 'Profile' }],
  ])('%s -> %j', (pathname, expected) => {
    expect(getPetContext(pathname)).toEqual(expected);
  });

  // location.pathname never actually contains a query string in React
  // Router (that lives in location.search instead) — this just confirms
  // the (?:$|\?) branch in the screen patterns doesn't misbehave if it
  // ever did receive one, without asserting on an input shape that can't
  // occur in production.
  it('is not confused by a stray ? if one were ever present', () => {
    expect(getPetContext('/pet/abc123/trends?section=trends')).toEqual({ petId: 'abc123', screen: 'Trends' });
  });
});
