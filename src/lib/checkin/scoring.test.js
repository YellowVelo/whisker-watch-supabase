import { describe, it, expect } from 'vitest';
import {
  computeHealthScore, resolveDailyAttributeCount, computeAttributeDirection,
  computeHealthScoreDirection, computeWeightDirection,
} from './scoring';

// Health Score — equal-weight, multi-select symptom counts (supersedes the
// per-option severity_score/health_score_deduction grading).
describe('computeHealthScore', () => {
  it('a normal day (no symptoms) produces 10/10', () => {
    expect(computeHealthScore({})).toEqual({ score: 10, totalDeduction: 0, deductionsByAttribute: {}, reasonSummary: null });
  });

  it('one symptom per attribute across two attributes produces 8/10', () => {
    const result = computeHealthScore({ appetite: 1, vomiting: 1 });
    expect(result.score).toBe(8);
    expect(result.totalDeduction).toBe(2);
    expect(result.deductionsByAttribute).toEqual({ appetite: 1, vomiting: 1 });
  });

  it('one attribute cannot deduct more than 2, even with 3+ distinct symptoms logged', () => {
    const result = computeHealthScore({ stool: 3 });
    expect(result.deductionsByAttribute.stool).toBe(2);
    expect(result.score).toBe(8);
  });

  it('all five Health Attributes at max deduction produce 0/10', () => {
    const result = computeHealthScore({
      appetite: 2, water_intake: 2, bathroom: 2, stool: 2, vomiting: 2,
    });
    expect(result.score).toBe(0);
    expect(result.totalDeduction).toBe(10);
  });

  it('Wellbeing/Weight/unknown attributes never affect the score, even if counts are passed in', () => {
    const result = computeHealthScore({
      energy: 2, mobility: 1, breathing: 1, itching: 1, weight: 2, some_unknown_code: 1,
    });
    expect(result.score).toBe(10);
    expect(result.totalDeduction).toBe(0);
    expect(result.deductionsByAttribute).toEqual({});
  });

  it('builds a reason summary only from attributes with a deduction greater than zero', () => {
    const result = computeHealthScore({ appetite: 0, vomiting: 1 });
    expect(result.reasonSummary).toBe('Vomiting');
  });
});

describe('resolveDailyAttributeCount', () => {
  it('a missing check-in is unknown, never zero', () => {
    expect(resolveDailyAttributeCount({ status: undefined, count: 0 })).toEqual({ count: null, known: false });
  });

  it('a skipped check-in is unknown, never zero', () => {
    expect(resolveDailyAttributeCount({ status: 'skipped', count: 0 })).toEqual({ count: null, known: false });
  });

  it('a completed check-in with no symptoms for the attribute is a known zero count', () => {
    expect(resolveDailyAttributeCount({ status: 'normal', count: 0 })).toEqual({ count: 0, known: true });
    expect(resolveDailyAttributeCount({ status: 'changed', count: 0 })).toEqual({ count: 0, known: true });
  });

  it('a completed check-in with symptoms uses the real count', () => {
    expect(resolveDailyAttributeCount({ status: 'changed', count: 2 })).toEqual({ count: 2, known: true });
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

describe('computeHealthScoreDirection', () => {
  it('unknown when today is missing (no check-in)', () => {
    expect(computeHealthScoreDirection(null, 8, null, 'normal')).toBe('unknown');
  });

  it('unknown when today was skipped', () => {
    expect(computeHealthScoreDirection(null, 8, 'skipped', 'normal')).toBe('unknown');
  });

  it('unknown when yesterday is missing', () => {
    expect(computeHealthScoreDirection(9, null, 'normal', null)).toBe('unknown');
  });

  it('unknown when yesterday was skipped', () => {
    expect(computeHealthScoreDirection(9, null, 'normal', 'skipped')).toBe('unknown');
  });

  it('up/down/equal when both days are complete and scored', () => {
    expect(computeHealthScoreDirection(9, 7, 'normal', 'changed')).toBe('up');
    expect(computeHealthScoreDirection(6, 9, 'changed', 'normal')).toBe('down');
    expect(computeHealthScoreDirection(10, 10, 'normal', 'normal')).toBe('equal');
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
