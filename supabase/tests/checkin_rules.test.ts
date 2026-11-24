// Unit tests for the server copy of the check-in counting rules (spec 0080,
// supabase/functions/_shared/checkinRules.ts). Pure: no network, no logins,
// no file access. The lists themselves are compared with the app's copies
// by src/lib/aiServerParity.test.js (Vitest); this file tests the code.
//
// Run: deno test --node-modules-dir=none supabase/tests/checkin_rules.test.ts

import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  attributeDaySeries,
  COUNTED_ATTRIBUTES,
  dateStrForInstant,
  dateStrInTimezone,
  isCountableSymptom,
  type CheckInRow,
  type ObservationRow,
} from '../functions/_shared/checkinRules.ts';

const day = (id: string, check_in_date: string, status: string | null = 'great'): CheckInRow => ({ id, check_in_date, status });
const obs = (daily_check_in_id: string, value: string | null): ObservationRow => ({ daily_check_in_id, value });

Deno.test('COUNTED_ATTRIBUTES: 11 codes, Health then Wellbeing', () => {
  assertEquals([...COUNTED_ATTRIBUTES], [
    'appetite', 'water_intake', 'bathroom', 'stool', 'vomiting', 'nausea',
    'energy', 'mobility', 'breathing', 'itching', 'behavior',
  ]);
});

Deno.test('isCountableSymptom: baseline, not-observed and empty answers never count', () => {
  for (const v of ['normal', 'none', 'no_change', 'not_observed', null, undefined]) {
    assertEquals(isCountableSymptom(v), false, String(v));
  }
  assertEquals(isCountableSymptom('ate_little_less'), true);
});

Deno.test('attributeDaySeries: normal day (only baseline answers) is normal with count 0', () => {
  assertEquals(attributeDaySeries([day('a', '2026-11-01')], [obs('a', 'normal')]), [
    { date: '2026-11-01', state: 'normal', count: 0 },
  ]);
});

Deno.test('attributeDaySeries: a completed day with no observation rows is normal', () => {
  assertEquals(attributeDaySeries([day('a', '2026-11-01')], []), [
    { date: '2026-11-01', state: 'normal', count: 0 },
  ]);
});

Deno.test('attributeDaySeries: counts distinct symptom rows, ignoring baseline and null values', () => {
  const series = attributeDaySeries(
    [day('a', '2026-11-01'), day('b', '2026-11-02')],
    [obs('a', 'ate_little_less'), obs('b', 'ate_much_less'), obs('b', 'ate_more'), obs('b', 'normal'), obs('b', null)],
  );
  assertEquals(series, [
    { date: '2026-11-01', state: 'observed', count: 1 },
    { date: '2026-11-02', state: 'observed', count: 2 },
  ]);
});

Deno.test('attributeDaySeries: skipped day is skipped and its observations are ignored', () => {
  assertEquals(attributeDaySeries([day('a', '2026-11-01', 'skipped')], [obs('a', 'ate_much_less')]), [
    { date: '2026-11-01', state: 'skipped', count: null },
  ]);
});

Deno.test('attributeDaySeries: "Not observed" wins over other answers that day', () => {
  assertEquals(
    attributeDaySeries([day('a', '2026-11-01')], [obs('a', 'more_than_usual'), obs('a', 'not_observed')]),
    [{ date: '2026-11-01', state: 'not_observed', count: null }],
  );
});

Deno.test('attributeDaySeries: observations for check-ins not in the list are ignored', () => {
  assertEquals(attributeDaySeries([day('a', '2026-11-01')], [obs('other', 'ate_much_less')]), [
    { date: '2026-11-01', state: 'normal', count: 0 },
  ]);
});

Deno.test('attributeDaySeries: output is oldest first and the input is not reordered', () => {
  const checkIns = [day('c', '2026-11-03'), day('a', '2026-11-01'), day('b', '2026-11-02')];
  const series = attributeDaySeries(checkIns, [obs('b', 'ate_more')]);
  assertEquals(series.map((p) => p.date), ['2026-11-01', '2026-11-02', '2026-11-03']);
  assertEquals(series.map((p) => p.state), ['normal', 'observed', 'normal']);
  assertEquals(checkIns.map((c) => c.id), ['c', 'a', 'b']);
});

Deno.test('attributeDaySeries: never uses Vibe (same symptoms on Great, Off, Tough or no status give the same series)', () => {
  const observations = [obs('a', 'ate_little_less'), obs('b', 'normal'), obs('c', 'ate_much_less'), obs('c', 'ate_more')];
  const build = (status: string | null) =>
    attributeDaySeries([day('a', '2026-11-01', status), day('b', '2026-11-02', status), day('c', '2026-11-03', status)], observations);
  const great = build('great');
  assertEquals(build('off'), great);
  assertEquals(build('tough'), great);
  assertEquals(build(null), great);
});

Deno.test('attributeDaySeries: empty input gives an empty series', () => {
  assertEquals(attributeDaySeries([], []), []);
});

// Fixed instant near a UTC day boundary, so a timezone-blind version fails.
const NEAR_MIDNIGHT_UTC = Date.parse('2026-03-05T02:00:00Z');

Deno.test('dateStrInTimezone: uses the given IANA timezone, not UTC', () => {
  assertEquals(dateStrInTimezone('UTC', 0, NEAR_MIDNIGHT_UTC), '2026-03-05');
  assertEquals(dateStrInTimezone('America/Los_Angeles', 0, NEAR_MIDNIGHT_UTC), '2026-03-04');
  assertEquals(dateStrInTimezone('Asia/Tokyo', 0, NEAR_MIDNIGHT_UTC), '2026-03-05');
});

Deno.test('dateStrInTimezone: offsets by whole days', () => {
  assertEquals(dateStrInTimezone('America/Los_Angeles', -1, NEAR_MIDNIGHT_UTC), '2026-03-03');
  assertEquals(dateStrInTimezone('UTC', -30, NEAR_MIDNIGHT_UTC), '2026-02-03');
  assertEquals(dateStrInTimezone('UTC', 1, NEAR_MIDNIGHT_UTC), '2026-03-06');
});

Deno.test('dateStrInTimezone: falls back to UTC for a missing or invalid timezone', () => {
  assertEquals(dateStrInTimezone(undefined, 0, NEAR_MIDNIGHT_UTC), '2026-03-05');
  assertEquals(dateStrInTimezone(null, 0, NEAR_MIDNIGHT_UTC), '2026-03-05');
  assertEquals(dateStrInTimezone('', 0, NEAR_MIDNIGHT_UTC), '2026-03-05');
  assertEquals(dateStrInTimezone('Not/AZone', 0, NEAR_MIDNIGHT_UTC), '2026-03-05');
});

Deno.test('dateStrInTimezone: defaults to the current time', () => {
  assertEquals(dateStrInTimezone('UTC'), dateStrForInstant(new Date(), 'UTC'));
});

Deno.test('dateStrForInstant: formats as YYYY-MM-DD', () => {
  assertEquals(dateStrForInstant(new Date('2026-01-09T12:00:00Z'), 'UTC'), '2026-01-09');
});
