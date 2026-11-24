// Unit tests for the Vet Report Wellness Overview data (spec 0080, FR15-FR17,
// AC10 data, AC11): supabase/functions/generate-vet-report/wellness.ts, and
// the approved wording B in wellnessText.ts.
// Pure: no network, no logins, no file access.
//
// Run: deno test --node-modules-dir=none supabase/tests/vet_report_wellness.test.ts

import { assertEquals, assertThrows } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { dateStrInTimezone, type CheckInRow } from '../functions/_shared/checkinRules.ts';
import {
  buildWellnessOverview,
  overviewWindow,
  windowDates,
  WINDOW_DAYS,
  type WellnessObservation,
} from '../functions/generate-vet-report/wellness.ts';
import {
  humanizeCode,
  layoutRuns,
  LEGEND_BLANK,
  LEGEND_NORMAL,
  LEGEND_ONE,
  LEGEND_TWO_PLUS,
  NO_CHECK_INS_TEXT,
  NO_SYMPTOMS_TEXT,
  OVERVIEW_HEADING,
  SYMPTOMS_LABEL,
  SYMPTOMS_NOTE,
  symptomListText,
  VIBE_LABEL,
  VIBE_NOTE,
  vibeTotalsParts,
  vibeTotalsText,
  windowText,
} from '../functions/generate-vet-report/wellnessText.ts';

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

Deno.test("overviewWindow: 30 calendar days ending today in the owner's time zone", () => {
  // 2026-11-23 15:00 UTC = 10:00 in New York, 2026-11-24 00:00 in Tokyo.
  const now = Date.parse('2026-11-23T15:00:00Z');
  assertEquals(overviewWindow('America/New_York', now), { start: '2026-10-25', end: '2026-11-23' });
  assertEquals(overviewWindow('Asia/Tokyo', now), { start: '2026-10-26', end: '2026-11-24' });
  assertEquals(overviewWindow(null, now), { start: '2026-10-25', end: '2026-11-23' });
});

Deno.test("overviewWindow: a daylight-saving change in the window never moves the start off the chart's first day", () => {
  // 2026-11-23 04:30 UTC = 2026-11-22 23:30 in New York (EST). Clocks went
  // back on 2026-11-01, so 29x24 hours earlier is 00:30 EDT on Oct 25,
  // one calendar day after the chart's first day (Oct 24).
  const now = Date.parse('2026-11-23T04:30:00Z');
  const w = overviewWindow('America/New_York', now);
  assertEquals(w, { start: '2026-10-24', end: '2026-11-22' });
  assertEquals(w.start, windowDates(w.end)[0]);
  assertEquals(dateStrInTimezone('America/New_York', -29, now), '2026-10-25'); // the old, wrong start
  // Spring forward (2026-03-08): the start still matches the chart.
  const spring = Date.parse('2026-03-20T03:30:00Z'); // 2026-03-19 23:30 EDT
  const s = overviewWindow('America/New_York', spring);
  assertEquals(s, { start: '2026-02-18', end: '2026-03-19' });
  assertEquals(s.start, windowDates(s.end)[0]);
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

Deno.test('an attribute whose only non-normal answers are "Not observed" never gets a chart', () => {
  const checkIns = DATES.map((d, i) => day(`c${i}`, d, i === 3 ? 'skipped' : 'great'));
  const observations = DATES.flatMap((_d, i) =>
    i % 2 === 0 ? [obs(`c${i}`, 'bathroom', 'not_observed', 'Not observed')] : [obs(`c${i}`, 'bathroom', 'normal', 'Normal')]
  );
  const o = build(checkIns, observations);
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

// ── Approved wording B (spec 0080), wellnessText.ts ─────────────────────

Deno.test('wording B: window text, same year: start without the year, end with it', () => {
  assertEquals(windowText('2026-10-25', '2026-11-23'), 'last 30 days (Oct 25 – Nov 23, 2026)');
  const o = build([]);
  assertEquals(windowText(o.startDate, o.endDate), 'last 30 days (Oct 25 – Nov 23, 2026)');
  assertEquals(windowText('2026-12-01', '2026-12-30'), 'last 30 days (Dec 1 – Dec 30, 2026)');
});

Deno.test('wording B: window text across New Year shows both years', () => {
  assertEquals(windowText('2026-12-12', '2027-01-10'), 'last 30 days (Dec 12, 2026 – Jan 10, 2027)');
  const dates = windowDates('2027-01-10');
  assertEquals(windowText(dates[0], dates[29]), 'last 30 days (Dec 12, 2026 – Jan 10, 2027)');
});

Deno.test('Vibe totals parts: one "Label N" pair each, joined by " · " into the approved line', () => {
  const v = { great: 21, off: 6, tough: 2, skipped: 1, noCheckIn: 0, notRecorded: 3 };
  assertEquals(vibeTotalsParts(v), ['Great Day 21', 'Off Day 6', 'Tough Day 2', 'Skipped 1', 'No check-in 0', 'Not recorded 3']);
  assertEquals(vibeTotalsParts(v).join(' · '), vibeTotalsText(v));
});

Deno.test('layoutRuns: a nowrap "Label N" pair is never split across lines; breaks fall after " ·"', () => {
  // Width = character count. The prefix plus parts as index.ts builds them.
  const measure = (t: string) => t.length;
  const parts = vibeTotalsParts({ great: 21, off: 6, tough: 2, skipped: 1, noCheckIn: 1, notRecorded: 0 });
  const runs = [
    { text: 'How the days went', font: 'b' },
    { text: " (the owner's own daily rating): ", font: 'r' },
    ...parts.flatMap((part, i) =>
      i < parts.length - 1 ? [{ text: `${part} ·`, font: 'r', nowrap: true }, { text: ' ', font: 'r' }] : [{ text: part, font: 'r', nowrap: true }]
    ),
  ];
  for (const maxWidth of [30, 40, 55, 70, 75, 85, 100, 200]) {
    const lines = layoutRuns(runs, maxWidth, measure).map((l) => l.map((r) => r.text).join(''));
    assertEquals(
      lines.join(' '),
      "How the days went (the owner's own daily rating): Great Day 21 · Off Day 6 · Tough Day 2 · Skipped 1 · No check-in 1",
    );
    for (const line of lines) {
      assertEquals(line, line.trim());
      assertEquals(/^(\d|·)/.test(line), false, `line starts with a number or separator at width ${maxWidth}: "${line}"`);
    }
    for (const part of parts) assertEquals(lines.some((l) => l.includes(part)), true, `"${part}" was split at width ${maxWidth}`);
  }
});

Deno.test('wording B: Vibe totals line, with Not recorded only when > 0', () => {
  const v = { great: 21, off: 6, tough: 2, skipped: 1, noCheckIn: 0, notRecorded: 0 };
  assertEquals(vibeTotalsText(v), 'Great Day 21 · Off Day 6 · Tough Day 2 · Skipped 1 · No check-in 0');
  assertEquals(
    vibeTotalsText({ ...v, notRecorded: 2 }),
    'Great Day 21 · Off Day 6 · Tough Day 2 · Skipped 1 · No check-in 0 · Not recorded 2',
  );
  assertEquals(VIBE_LABEL + VIBE_NOTE, "How the days went (the owner's own daily rating): ");
  assertEquals(SYMPTOMS_LABEL + SYMPTOMS_NOTE, 'Symptoms logged (counted separately from the daily rating):');
  assertEquals(OVERVIEW_HEADING, 'Wellness Overview');
});

Deno.test('wording B: symptom list says "1 day" for one and "N days" otherwise', () => {
  assertEquals(symptomListText([{ label: 'Ate a little less', days: 18 }]), 'Ate a little less (18 days)');
  assertEquals(
    symptomListText([{ label: 'Ate a little less', days: 18 }, { label: 'Ate much less', days: 1 }]),
    'Ate a little less (18 days), Ate much less (1 day)',
  );
});

Deno.test('wording B: Tribble example end to end (vibe line, Appetite listed, Water not)', () => {
  const { checkIns, observations } = tribble();
  const overview = build(checkIns, observations);
  assertEquals(vibeTotalsText(overview.vibe), 'Great Day 30 · Off Day 0 · Tough Day 0 · Skipped 0 · No check-in 0');
  assertEquals(overview.attributes.map((a) => `${a.label} — ${symptomListText(a.symptoms)}`), [
    'Appetite — Ate a little less (18 days), Ate much less (2 days)',
  ]);
});

Deno.test('wording B: empty-state messages', () => {
  assertEquals(NO_CHECK_INS_TEXT, 'No daily check-ins were recorded in the last 30 days.');
  assertEquals(NO_SYMPTOMS_TEXT, 'No symptoms were logged in the last 30 days.');
});

Deno.test('legend wording: no "Not observed" item; Not observed days are blank', () => {
  assertEquals(
    [LEGEND_NORMAL, LEGEND_ONE, LEGEND_TWO_PLUS, LEGEND_BLANK],
    ['Normal', '1 symptom', '2+ symptoms', 'Blank = skipped, no check-in, or not observed'],
  );
});

Deno.test('humanizeCode: underscores to spaces, first letter capitalized', () => {
  assertEquals(humanizeCode('ate_little_less'), 'Ate little less');
  assertEquals(humanizeCode('water_intake'), 'Water intake');
  assertEquals(humanizeCode('picky'), 'Picky');
  assertEquals(humanizeCode('__odd__value_'), 'Odd value');
});
