import { describe, it, expect } from 'vitest';
import { scannedBloodworkToForm } from './bloodworkScanResult';

// Spec 0081 rollout: the Add Bloodwork form is prefilled from either the
// old flat scan answer or the new { visits, skipped } answer (FR35).

describe('scannedBloodworkToForm', () => {
  it('passes the old flat answer through unchanged', () => {
    const flat = { date: '2026-10-02', lab_name: 'IDEXX', bun: 32, creatinine: 2.1, urine_protein: 'Trace' };
    expect(scannedBloodworkToForm(flat)).toBe(flat);
  });

  it('passes an empty answer through, as before', () => {
    expect(scannedBloodworkToForm(null)).toBeNull();
    expect(scannedBloodworkToForm(undefined)).toBeUndefined();
  });

  it('flattens the first (newest) visit of the new answer', () => {
    const answer = {
      visits: [
        {
          date: '2026-10-02', lab_name: 'IDEXX', vet_name: 'Dr. Patel', notes: 'Fasted',
          urine_specific_gravity: '1.020', urine_protein: 'Trace',
          values: { bun: 32, sdma: 15 }, weight_lbs: 9.8, not_tracked: ['Chloride'], conflict: false,
        },
        { date: '2026-03-14', values: { bun: 25 }, not_tracked: [], conflict: false },
      ],
      skipped: [{ visit: 0, date: '2026-10-02', field: 'creatinine', label: 'Creatinine', unit: 'µmol/L', value: 194.48 }],
    };
    expect(scannedBloodworkToForm(answer)).toEqual({
      date: '2026-10-02', lab_name: 'IDEXX', vet_name: 'Dr. Patel', notes: 'Fasted',
      urine_specific_gravity: '1.020', urine_protein: 'Trace', bun: 32, sdma: 15,
    });
  });

  it('never prefills a skipped value, the weight or anything that is not a bloodwork field', () => {
    const answer = {
      visits: [{ date: '2026-10-02', values: { bun: 32, chloride: 118, creatinine: '2.1' }, weight_lbs: 9.8, not_tracked: [], conflict: true }],
      skipped: [{ visit: 0, date: '2026-10-02', field: 'creatinine', label: 'Creatinine', unit: 'µmol/L', value: 194.48 }],
    };
    const form = scannedBloodworkToForm(answer);
    expect(form).toEqual({ date: '2026-10-02', bun: 32 });
  });

  it('gives an empty record when no visit was found', () => {
    expect(scannedBloodworkToForm({ visits: [], skipped: [] })).toEqual({});
  });
});
