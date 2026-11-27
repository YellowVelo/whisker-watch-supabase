import { describe, it, expect, vi } from 'vitest';

// Spec 0087 AC8: the calendar export has no event for a medication that
// isn't current (ended, or switched off). Vaccinations are unchanged.
vi.mock('@/api/entities', () => ({ entities: {} }));
vi.mock('@/lib/AuthContext', () => ({ useAuth: () => ({ user: null }) }));
// src/lib/utils.js (imported by the ui primitives) reads window at load time.
if (typeof globalThis.window === 'undefined') {
  /** @type {any} */ (globalThis).window = { self: globalThis, top: globalThis };
}

const { buildCalendarEvents } = await import('../ExportCalendarButton.jsx');

const TODAY = '2026-11-27';
const med = (id, extra) => ({ id, name: `Med ${id}`, next_due_date: '2026-12-10', active: true, end_date: null, ...extra });

describe('buildCalendarEvents (spec 0087 AC8)', () => {
  it('has no event for a medication whose end date has passed', () => {
    const events = buildCalendarEvents({
      meds: [med('current'), med('ended', { end_date: '2026-11-26' })],
      vaccines: [],
      petName: 'Tribble',
      todayStr: TODAY,
    });
    expect(events.map((e) => e.uid)).toEqual(['med-current']);
  });

  it('keeps a medication ending today (AC3) and drops a switched-off one (AC6)', () => {
    const events = buildCalendarEvents({
      meds: [med('today', { end_date: TODAY }), med('off', { active: false })],
      vaccines: [],
      petName: 'Tribble',
      todayStr: TODAY,
    });
    expect(events.map((e) => e.uid)).toEqual(['med-today']);
  });

  it('still skips meds with no due date and keeps vaccinations with one', () => {
    const events = buildCalendarEvents({
      meds: [med('nodue', { next_due_date: null })],
      vaccines: [
        { id: 'v1', vaccine_name: 'Rabies', next_due_date: '2027-01-01' },
        { id: 'v2', vaccine_name: 'FVRCP', next_due_date: null },
      ],
      petName: 'Tribble',
      todayStr: TODAY,
    });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ uid: 'vax-v1', date: '2027-01-01', title: 'Tribble: Rabies due' });
  });
});
