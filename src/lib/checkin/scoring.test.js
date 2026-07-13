import { describe, it, expect } from 'vitest';
import {
  computeSymptomCount, resolveDailyAttributeCount, computeAttributeDirection, computeWeightDirection,
} from './scoring';

// Daily Check-In, Vibe & Trends (spec v5) — Symptom Count is an
// unweighted sum across all 11 counted categories, never a score.
describe('computeSymptomCount', () => {
  it('a normal day (no symptoms) produces 0', () => {
    expect(computeSymptomCount({})).toBe(0);
  });

  it('sums distinct symptom counts across every category, unweighted, uncapped', () => {
    expect(computeSymptomCount({ appetite: 1, vomiting: 3, nausea: 2 })).toBe(6);
  });
});

describe('resolveDailyAttributeCount', () => {
  it('a missing check-in is unknown, never zero', () => {
    expect(resolveDailyAttributeCount({ hasCheckIn: false, count: 0 })).toEqual({ count: null, known: false });
  });

  it('a skipped check-in is unknown, never zero', () => {
    expect(resolveDailyAttributeCount({ status: 'skipped', count: 0 })).toEqual({ count: null, known: false });
  });

  it('a completed check-in with no symptoms for the attribute is a known zero count', () => {
    expect(resolveDailyAttributeCount({ status: 'great', count: 0 })).toEqual({ count: 0, known: true });
    expect(resolveDailyAttributeCount({ status: 'off', count: 0 })).toEqual({ count: 0, known: true });
    expect(resolveDailyAttributeCount({ status: 'tough', count: 0 })).toEqual({ count: 0, known: true });
  });

  it('a migrated day with no Vibe but a real check-in is still a known count', () => {
    expect(resolveDailyAttributeCount({ status: null, hasCheckIn: true, count: 2 })).toEqual({ count: 2, known: true });
  });

  it('a completed check-in with symptoms uses the real count', () => {
    expect(resolveDailyAttributeCount({ status: 'off', count: 2 })).toEqual({ count: 2, known: true });
  });
});

describe('computeAttributeDirection', () => {
  it('unknown when yesterday is missing', () => {
    const today = { count: 1, known: true };
    const yesterdayMissing = { count: null, known: false };
    expect(computeAttributeDirection(today, yesterdayMissing)).toBe('unknown');
  });

  it('unknown when yesterday was skipped', () => {
    const today = { count: 0, known: true };
    const yesterdaySkipped = { count: null, known: false };
    expect(computeAttributeDirection(today, yesterdaySkipped)).toBe('unknown');
  });

  it('fewer symptoms today than yesterday is up (better)', () => {
    expect(computeAttributeDirection({ count: 0, known: true }, { count: 2, known: true })).toBe('up');
  });

  it('more symptoms today than yesterday is down (worse)', () => {
    expect(computeAttributeDirection({ count: 1, known: true }, { count: 0, known: true })).toBe('down');
  });

  it('same count both days is equal', () => {
    expect(computeAttributeDirection({ count: 1, known: true }, { count: 1, known: true })).toBe('equal');
  });
});

describe('computeWeightDirection', () => {
  it('unknown when either value is missing (never treated as zero)', () => {
    expect(computeWeightDirection(null, 9.2)).toBe('unknown');
    expect(computeWeightDirection(9.2, null)).toBe('unknown');
  });

  it('up/down/equal from numeric comparison', () => {
    expect(computeWeightDirection(9.5, 9.2)).toBe('up');
    expect(computeWeightDirection(9.0, 9.2)).toBe('down');
    expect(computeWeightDirection(9.2, 9.2)).toBe('equal');
  });
});
