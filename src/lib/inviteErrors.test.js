import { describe, expect, it } from 'vitest';
import { isRateLimited } from './inviteErrors.js';

describe('isRateLimited (spec 0077)', () => {
  it('is true for a 429 reply', () => {
    expect(isRateLimited({ context: new Response('{}', { status: 429 }) })).toBe(true);
  });

  it('is false for other failures and for no error', () => {
    expect(isRateLimited({ context: new Response('{}', { status: 404 }) })).toBe(false);
    expect(isRateLimited({ context: new Response('{}', { status: 500 }) })).toBe(false);
    expect(isRateLimited(new Error('network down'))).toBe(false);
    expect(isRateLimited(null)).toBe(false);
    expect(isRateLimited(undefined)).toBe(false);
  });
});
