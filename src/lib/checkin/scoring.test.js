import { describe, it, expect, vi } from 'vitest';
import {
  computeHealthScore, resolveDailyAttributeState, computeAttributeDirection,
  computeHealthScoreDirection, computeWeightDirection,
} from './scoring';

// Health Score Revision V2 — required-tests #1-4, #6, #8-10, #14 from the
// feature spec, plus the direction-state edge cases.
describe('computeHealthScore', () => {
  it('a normal day (no observations) produces 10/10', () => {
    expect(computeHealthScore([])).toEqual({ score: 10, totalDeduction: 0, deductionsByAttribute: {}, reasonSummary: null });
  });

  it('three deductions across different attributes produce 7/10', () => {
    const result = computeHealthScore([
      { code: 'appetite', health_score_deduction: 1 },
      { code: 'vomiting', health_score_deduction: 2 },
    ]);
    expect(result.score).toBe(7);
    expect(result.totalDeduction).toBe(3);
    expect(result.deductionsByAttribute).toEqual({ appetite: 1, vomiting: 2 });
  });

  it('one attribute cannot deduct more than 2, even from duplicate observations', () => {
    const result = computeHealthScore([
      { code: 'stool', health_score_deduction: 2 },
      { code: 'stool', health_score_deduction: 2 },
    ]);
    expect(result.deductionsByAttribute.stool).toBe(2);
    expect(result.score).toBe(8);
  });

  it('all five Health Attributes at max deduction produce 0/10', () => {
    const result = computeHealthScore([
      { code: 'appetite', health_score_deduction: 2 },
      { code: 'water_intake', health_score_deduction: 2 },
      { code: 'bathroom', health_score_deduction: 2 },
      { code: 'stool', health_score_deduction: 2 },
      { code: 'vomiting', health_score_deduction: 2 },
    ]);
    expect(result.score).toBe(0);
    expect(result.totalDeduction).toBe(10);
  });

  it('Wellbeing/Weight/unknown attributes never affect the score, and log a warning', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = computeHealthScore([
      { code: 'energy', health_score_deduction: 2 },
      { code: 'mobility', health_score_deduction: 1 },
      { code: 'breathing', health_score_deduction: 1 },
      { code: 'itching', health_score_deduction: 1 },
      { code: 'weight', health_score_deduction: 2 },
      { code: 'some_unknown_code', health_score_deduction: 1 },
    ]);
    expect(result.score).toBe(10);
    expect(result.totalDeduction).toBe(0);
    expect(warn).toHaveBeenCalledTimes(6);
    warn.mockRestore();
  });

  it('builds a reason summary only from attributes with a deduction greater than zero', () => {
    const result = computeHealthScore([
      { code: 'appetite', health_score_deduction: 0 },
      { code: 'vomiting', health_score_deduction: 1 },
    ]);
    expect(result.reasonSummary).toBe('Vomiting');
  });
});

describe('resolveDailyAttributeState', () => {
  it('a missing check-in is unknown, never baseline', () => {
    expect(resolveDailyAttributeState({ status: undefined, observation: null })).toEqual({ ordinal: null, known: false });
  });

  it('a skipped check-in is unknown, never baseline', () => {
    expect(resolveDailyAttributeState({ status: 'skipped', observation: null })).toEqual({ ordinal: null, known: false });
  });

  it('a completed check-in with no observation for the attribute inherits baseline (ordinal 0)', () => {
    expect(resolveDailyAttributeState({ status: 'normal', observation: null })).toEqual({ ordinal: 0, known: true });
    expect(resolveDailyAttributeState({ status: 'changed', observation: null })).toEqual({ ordinal: 0, known: true });
  });

  it('a completed check-in with an observation uses that option\'s direction_ordinal', () => {
    expect(resolveDailyAttributeState({ status: 'changed', observation: { direction_ordinal: 2 } })).toEqual({ ordinal: 2, known: true });
  });
});

describe('computeAttributeDirection', () => {
  it('unknown when yesterday is missing', () => {
    const today = { ordinal: 1, known: true };
    const yesterdayMissing = { ordinal: null, known: false };
    expect(computeAttributeDirection(today, yesterdayMissing)).toBe('unknown');
  });

  it('unknown when yesterday was skipped', () => {
    const today = { ordinal: 0, known: true };
    const yesterdaySkipped = { ordinal: null, known: false };
    expect(computeAttributeDirection(today, yesterdaySkipped)).toBe('unknown');
  });

  it('up/down/equal from ordinal comparison when both days are known', () => {
    expect(computeAttributeDirection({ ordinal: 2, known: true }, { ordinal: 0, known: true })).toBe('up');
    expect(computeAttributeDirection({ ordinal: -1, known: true }, { ordinal: 0, known: true })).toBe('down');
    expect(computeAttributeDirection({ ordinal: 0, known: true }, { ordinal: 0, known: true })).toBe('equal');
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
