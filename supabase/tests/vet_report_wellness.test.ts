// Unit tests for the Vet Report Wellness Overview data (spec 0080, FR15-FR17,
// AC10 data, AC11): supabase/functions/generate-vet-report/wellness.ts.
// Pure: no network, no logins, no file access.
//
// Run: deno test --node-modules-dir=none supabase/tests/vet_report_wellness.test.ts

import { assertEquals, assertThrows } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import type { CheckInRow } from '../functions/_shared/checkinRules.ts';
import {
  buildWellnessOverview,
  windowDates,
  WINDOW_DAYS,
  type WellnessObservation,
} from '../functions/generate-vet-report/wellness.ts';

const END = '2026-11-23';
const LABELS: Record<string, string> = {
  appetite: 'Appetite', water_intake: 'Water Intake', bathroom: 'Bathroom', stool: 'Stool',
  vomiting: 'Vomiting', nausea: 'Nausea', energy: 'Energy', mobility: 'Mobility',
  breathing: 'Breathing', itching: 'Itching', behavior: 'Behavior',
};
const DATES = windowDates(END);

const day = (id: string, check_in_date: string, status: string | null = 'great'): CheckInRow => ({ id, check_in_date, status });
const obs = (daily_check_in_id: string, attribute: string, value: string | null, label: string | null = null): WellnessObservation =>
  ({ daily_check_in_id, attribute, value, label });

const build = (checkIns: CheckInRow[], observations: WellnessObservation[] = []) =>
  buildWellnessOverview({ endDate: END, checkIns, observations, attributeLabels: LABELS });

// Lynn's Tribble example: a check-in every day of the window, Water normal
// all month, Appetite "Ate a little less" on 18 days and "Ate much less" on
// 2 of the other days.
function tribble(status: (i: number) => string | null = () => 'great') {
  const checkIns = DATES.map((d, i) => day(`c${i}`, d, status(i)));
  const observations: WellnessObservation[] = [];
  DATES.forEach((_d, i) => {
    observations.push(obs(`c${i}`, 'water_intake', 'normal', 'Normal'));
    if (i < 18) observations.push(obs(`c${i}`, 'appetite', 'ate_little_less', 'Ate a little less'));
    else if (i < 20) observations.push(obs(`c${i}`, 'appetite', 'ate_much_less', 'Ate much less'));
    else observations.push(obs(`c${i}`, 'appetite', 'normal', 'Normal'));
  });
  return { checkIns, observations };
}

Deno.test('windowDates: 30 days ending on the given date, oldest first, across a month boundary', () => {
  const dates = windowDates('2026-03-05');
  assertEquals(dates.length, WINDOW_DAYS);
  assertEquals(dates[0], '2026-02-04');
  assertEquals(dates[29], '2026-03-05');
  assertEquals(DATES[0], '2026-10-25');
  assertEquals(DATES[29], END);
});

Deno.test('windowDates: rejects a malformed date', () => {
  assertThrows(() => windowDates('not-a-date'));
});

Deno.test('AC10: Appetite with symptoms is charted with 30 days and day counts per symptom; normal Water is not', () => {
  const { checkIns, observations } = tribble();
  const o = build(checkIns, observations);
  assertEquals(o.startDate, '2026-10-25');
  assertEquals(o.endDate, END);
  assertEquals(o.attributes.map((a) => a.code), ['appetite']);
  const appetite = o.attributes[0];
  assertEquals(appetite.label, 'Appetite');
  assertEquals(appetite.days.length, 30);
  assertEquals(appetite.days.map((d) => d.date), DATES);
  assertEquals(appetite.days.slice(0, 20).every((d) => d.state === 'observed' && d.count === 1), true);
  assertEquals(appetite.days.slice(20).every((d) => d.state === 'normal' && d.count === 0), true);
  assertEquals(appetite.symptoms, [
    { label: 'Ate a little less', days: 18 },
    { label: 'Ate much less', days: 2 },
  ]);
  assertEquals(o.vibe, { great: 30, off: 0, tough: 0, skipped: 0, noCheckIn: 0, notRecorded: 0 });
  assertEquals(o.noCheckIns, false);
  assertEquals(o.noSymptoms, false);
});

Deno.test('AC11: the same symptoms on Great days and on Off days give identical attribute output', () => {
  const great = tribble(() => 'great');
  const off = tribble(() => 'off');
  const tough = tribble(() => 'tough');
  const mixed = tribble((i) => ['great', 'off', 'tough'][i % 3]);
  const unrated = tribble(() => null);
  const g = build(great.checkIns, great.observations);
  assertEquals(build(off.checkIns, off.observations).attributes, g.attributes);
  assertEquals(build(tough.checkIns, tough.observations).attributes, g.attributes);
  assertEquals(build(mixed.checkIns, mixed.observations).attributes, g.attributes);
  assertEquals(build(unrated.checkIns, unrated.observations).attributes, g.attributes);
  // Only the Vibe totals differ.
  assertEquals(build(off.checkIns, off.observations).vibe.off, 30);
  assertEquals(build(mixed.checkIns, mixed.observations).vibe, { great: 10, off: 10, tough: 10, skipped: 0, noCheckIn: 0, notRecorded: 0 });
});

Deno.test('Vibe totals: Great/Off/Tough/Skipped, missing days as No check-in, null status as Not recorded', () => {
  const o = build([
    day('a', DATES[0], 'great'),
    day('b', DATES[1], 'off'),
    day('c', DATES[2], 'off'),
    day('d', DATES[3], 'tough'),
    day('e', DATES[4], 'skipped'),
    day('f', DATES[5], null),
  ]);
  assertEquals(o.vibe, { great: 1, off: 2, tough: 1, skipped: 1, noCheckIn: 24, notRecorded: 1 });
  const v = o.vibe;
  assertEquals(v.great + v.off + v.tough + v.skipped + v.noCheckIn + v.notRecorded, 30);
});

Deno.test('skipped and missing days: skipped shows skipped (its symptoms ignored), no row shows missing', () => {
  const o = build(
    [day('a', DATES[0]), day('s', DATES[1], 'skipped'), day('c', DATES[3])],
    [
      obs('a', 'energy', 'lower', 'Lower energy'),
      obs('s', 'energy', 'much_lower', 'Much lower energy'),
      obs('c', 'energy', 'lower', 'Lower energy'),
      obs('c', 'energy', 'restless', 'Restless'),
    ],
  );
  assertEquals(o.attributes.map((a) => a.code), ['energy']);
  const energy = o.attributes[0];
  assertEquals(energy.days[0], { date: DATES[0], state: 'observed', count: 1 });
  assertEquals(energy.days[1], { date: DATES[1], state: 'skipped', count: null });
  assertEquals(energy.days[2], { date: DATES[2], state: 'missing', count: null });
  assertEquals(energy.days[3], { date: DATES[3], state: 'observed', count: 2 });
  assertEquals(energy.days.slice(4).every((d) => d.state === 'missing' && d.count === null), true);
  assertEquals(energy.symptoms, [
    { label: 'Lower energy', days: 2 },
    { label: 'Restless', days: 1 },
  ]);
});

Deno.test('skipped-day symptoms alone never make a chart', () => {
  const o = build([day('s', DATES[0], 'skipped')], [obs('s', 'appetite', 'ate_much_less', 'Ate much less')]);
  assertEquals(o.attributes, []);
  assertEquals(o.noSymptoms, true);
});

Deno.test('"Not observed" is never a symptom: Water/Bathroom not_observed all month gives no chart', () => {
  const checkIns = DATES.map((d, i) => day(`c${i}`, d));
  const observations = DATES.flatMap((_d, i) => [
    obs(`c${i}`, 'water_intake', 'not_observed', 'Not observed'),
    obs(`c${i}`, 'bathroom', 'not_observed', 'Not observed'),
  ]);
  const o = build(checkIns, observations);
  assertEquals(o.attributes, []);
  assertEquals(o.noSymptoms, true);
});

Deno.test('"Not observed" days show as not_observed in a charted attribute and are left out of the symptom list', () => {
  const o = build(
    [day('a', DATES[0]), day('b', DATES[1])],
    [
      obs('a', 'water_intake', 'more_than_usual', 'More than usual'),
      obs('b', 'water_intake', 'more_than_usual', 'More than usual'),
      obs('b', 'water_intake', 'not_observed', 'Not observed'),
    ],
  );
  const water = o.attributes[0];
  assertEquals(water.code, 'water_intake');
  assertEquals(water.days[0], { date: DATES[0], state: 'observed', count: 1 });
  assertEquals(water.days[1], { date: DATES[1], state: 'not_observed', count: null });
  assertEquals(water.symptoms, [{ label: 'More than usual', days: 1 }]);
});

Deno.test('baseline answers (normal, none, no_change) never count', () => {
  const o = build(
    [day('a', DATES[0])],
    [obs('a', 'stool', 'normal'), obs('a', 'vomiting', 'none'), obs('a', 'behavior', 'no_change'), obs('a', 'itching', null)],
  );
  assertEquals(o.attributes, []);
  assertEquals(o.noSymptoms, true);
  assertEquals(o.noCheckIns, false);
});

Deno.test('an unrated (null status) day still charts its symptoms and counts under Not recorded', () => {
  const o = build([day('a', DATES[29], null)], [obs('a', 'appetite', 'ate_little_less', 'Ate a little less')]);
  assertEquals(o.vibe.notRecorded, 1);
  assertEquals(o.attributes[0].days[29], { date: END, state: 'observed', count: 1 });
  assertEquals(o.attributes[0].symptoms, [{ label: 'Ate a little less', days: 1 }]);
});

Deno.test('attributes come out in COUNTED_ATTRIBUTES order, using the display labels', () => {
  const o = build(
    [day('a', DATES[0])],
    [
      obs('a', 'behavior', 'hiding', 'Hiding'),
      obs('a', 'appetite', 'ate_more', 'Ate more'),
      obs('a', 'energy', 'lower', 'Lower energy'),
      obs('a', 'stool', 'soft', 'Soft'),
      obs('a', 'not_a_counted_code', 'something', 'Something'),
    ],
  );
  assertEquals(o.attributes.map((a) => a.code), ['appetite', 'stool', 'energy', 'behavior']);
  assertEquals(o.attributes.map((a) => a.label), ['Appetite', 'Stool', 'Energy', 'Behavior']);
});

Deno.test('symptom list: most days first, then label; falls back to the value when a label is missing; one count per day', () => {
  const o = build(
    [day('a', DATES[0]), day('b', DATES[1]), day('c', DATES[2])],
    [
      obs('a', 'itching', 'scratching', 'Scratching'),
      obs('a', 'itching', 'scratching', 'Scratching'), // same label twice on one day
      obs('b', 'itching', 'licking', 'Licking'),
      obs('b', 'itching', 'scratching', 'Scratching'),
      obs('c', 'itching', 'chewing', null),
    ],
  );
  assertEquals(o.attributes[0].days[0].count, 2); // the bar still counts both rows, as the app does
  assertEquals(o.attributes[0].symptoms, [
    { label: 'Scratching', days: 2 },
    { label: 'Licking', days: 1 },
    { label: 'chewing', days: 1 },
  ]);
});

Deno.test('empty state: no check-ins at all in the window', () => {
  const o = build([]);
  assertEquals(o.noCheckIns, true);
  assertEquals(o.noSymptoms, false);
  assertEquals(o.attributes, []);
  assertEquals(o.vibe, { great: 0, off: 0, tough: 0, skipped: 0, noCheckIn: 30, notRecorded: 0 });
});

Deno.test('empty state: check-ins but no symptoms', () => {
  const o = build(DATES.map((d, i) => day(`c${i}`, d)), DATES.map((_d, i) => obs(`c${i}`, 'appetite', 'normal', 'Normal')));
  assertEquals(o.noCheckIns, false);
  assertEquals(o.noSymptoms, true);
  assertEquals(o.attributes, []);
});

Deno.test('window boundaries: day -30 and tomorrow are excluded, day -29 and today are included', () => {
  const dayMinus30 = '2026-10-24';
  const tomorrow = '2026-11-24';
  const o = build(
    [day('old', dayMinus30, 'tough'), day('first', DATES[0], 'off'), day('today', END, 'great'), day('next', tomorrow, 'tough')],
    [
      obs('old', 'appetite', 'ate_much_less', 'Ate much less'),
      obs('next', 'appetite', 'ate_much_less', 'Ate much less'),
      obs('old', 'mobility', 'stiff', 'Stiff'),
      obs('first', 'energy', 'lower', 'Lower energy'),
      obs('today', 'energy', 'lower', 'Lower energy'),
    ],
  );
  assertEquals(o.vibe, { great: 1, off: 1, tough: 0, skipped: 0, noCheckIn: 28, notRecorded: 0 });
  assertEquals(o.attributes.map((a) => a.code), ['energy']);
  const energy = o.attributes[0];
  assertEquals(energy.days.length, 30);
  assertEquals(energy.days[0], { date: '2026-10-25', state: 'observed', count: 1 });
  assertEquals(energy.days[29], { date: END, state: 'observed', count: 1 });
  assertEquals(energy.symptoms, [{ label: 'Lower energy', days: 2 }]);
});

Deno.test('only outside-window check-ins: counts as no check-ins', () => {
  const o = build([day('old', '2026-10-24'), day('next', '2026-11-24')], [obs('old', 'appetite', 'ate_more', 'Ate more')]);
  assertEquals(o.noCheckIns, true);
  assertEquals(o.attributes, []);
});
