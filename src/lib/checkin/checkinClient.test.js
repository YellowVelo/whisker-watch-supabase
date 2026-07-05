import { describe, it, expect } from 'vitest';
import { describeObservation } from './checkinClient';
import { getCategory } from './config';

// Real observation_type ids don't matter here — describeObservation only
// needs the typeIdToCode map to resolve back to a CATEGORIES entry.
const appetiteTypeId = 'type-appetite';
const weightTypeId = 'type-weight';
const otherTypeId = 'type-other';
const typeIdToCode = {
  [appetiteTypeId]: 'appetite',
  [weightTypeId]: 'weight',
  [otherTypeId]: 'other',
};

describe('describeObservation', () => {
  it('returns the option label for a non-baseline enum answer', () => {
    const label = describeObservation(
      { observation_type_id: appetiteTypeId, value: 'ate_much_less' },
      typeIdToCode,
    );
    expect(label).toBe(getCategory('appetite').options.find((o) => o.value === 'ate_much_less').label);
  });

  it('suppresses baseline ("normal") enum answers — not worth surfacing as a change', () => {
    expect(describeObservation({ observation_type_id: appetiteTypeId, value: 'normal' }, typeIdToCode)).toBeNull();
  });

  it('returns null for an enum observation with no value', () => {
    expect(describeObservation({ observation_type_id: appetiteTypeId, value: null }, typeIdToCode)).toBeNull();
  });

  it('describes a number-type observation only when a numeric value was actually logged', () => {
    expect(describeObservation({ observation_type_id: weightTypeId, numeric_value: 12.4 }, typeIdToCode)).toBe('Weight updated');
    expect(describeObservation({ observation_type_id: weightTypeId, numeric_value: null }, typeIdToCode)).toBeNull();
  });

  it('describes a text-type observation only when notes were actually entered', () => {
    expect(describeObservation({ observation_type_id: otherTypeId, notes: 'Limping after the walk' }, typeIdToCode)).toBe('Other');
    expect(describeObservation({ observation_type_id: otherTypeId, notes: '' }, typeIdToCode)).toBeNull();
  });

  it('returns null when the observation type is unrecognized', () => {
    expect(describeObservation({ observation_type_id: 'unknown-type', value: 'x' }, typeIdToCode)).toBeNull();
  });
});
