// Unit tests for the server copy of the "is this food or medication
// current?" rule (spec 0087, supabase/functions/_shared/currentItems.ts),
// as used by the vet report's Medications table. Pure: no network, no
// logins, no file access. The rule itself is compared with the app's copy
// by src/lib/aiServerParity.test.js (Vitest).
//
// Run: deno test --node-modules-dir=none supabase/tests/current_items.test.ts

import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { medicationStatus, sortCurrentFirst } from '../functions/_shared/currentItems.ts';
import { dateStrInTimezone } from '../functions/_shared/checkinRules.ts';

const TODAY = '2026-11-27';

Deno.test('medicationStatus: switched on, no end date is Active', () => {
  assertEquals(medicationStatus({ active: true, end_date: null }, TODAY), 'Active');
});

Deno.test('medicationStatus: switched on, ends today is Active', () => {
  assertEquals(medicationStatus({ active: true, end_date: TODAY }, TODAY), 'Active');
});

Deno.test('medicationStatus: switched on, ends in the future is Active', () => {
  assertEquals(medicationStatus({ active: true, end_date: '2026-12-31' }, TODAY), 'Active');
});

Deno.test('medicationStatus: switched on but end date passed is Inactive (AC5)', () => {
  assertEquals(medicationStatus({ active: true, end_date: '2026-11-26' }, TODAY), 'Inactive');
});

Deno.test('medicationStatus: switched off is Inactive, whatever the end date', () => {
  assertEquals(medicationStatus({ active: false, end_date: null }, TODAY), 'Inactive');
  assertEquals(medicationStatus({ active: false, end_date: '2027-01-01' }, TODAY), 'Inactive');
  assertEquals(medicationStatus({ active: null, end_date: null }, TODAY), 'Inactive');
});

Deno.test('medicationStatus: malformed end date counts as not ended', () => {
  assertEquals(medicationStatus({ active: true, end_date: '11/01/2026' }, TODAY), 'Active');
  assertEquals(medicationStatus({ active: true, end_date: '' }, TODAY), 'Active');
});

Deno.test('medicationStatus: missing row is Inactive', () => {
  assertEquals(medicationStatus(null, TODAY), 'Inactive');
  assertEquals(medicationStatus(undefined, TODAY), 'Inactive');
});

Deno.test('sortCurrentFirst: current meds first, original order kept within each group (FR8)', () => {
  // Already ordered by start_date, newest first, as the vet report reads them.
  const rows = [
    { id: 'a', active: true, end_date: '2026-11-01', start_date: '2026-10-01' }, // ended
    { id: 'b', active: true, end_date: null, start_date: '2026-09-01' }, // current
    { id: 'c', active: false, end_date: null, start_date: '2026-08-01' }, // off
    { id: 'd', active: true, end_date: TODAY, start_date: '2026-07-01' }, // current
  ];
  assertEquals(sortCurrentFirst(rows, TODAY).map((r) => r.id), ['b', 'd', 'a', 'c']);
});

Deno.test('sortCurrentFirst: returns a new array and leaves the input alone', () => {
  const rows = [
    { id: 'a', active: false, end_date: null },
    { id: 'b', active: true, end_date: null },
  ];
  const sorted = sortCurrentFirst(rows, TODAY);
  assertEquals(sorted.map((r) => r.id), ['b', 'a']);
  assertEquals(rows.map((r) => r.id), ['a', 'b']);
});

Deno.test('sortCurrentFirst: null or empty input gives an empty list', () => {
  assertEquals(sortCurrentFirst(null, TODAY), []);
  assertEquals(sortCurrentFirst(undefined, TODAY), []);
  assertEquals(sortCurrentFirst([], TODAY), []);
});

// Spec 0087 QA: the server's "today" (FR2) is the caller's saved time zone,
// UTC if unset or not a real zone, as generate-vet-report and
// ask-vet-assistant compute it with dateStrInTimezone(timezone, 0).
Deno.test('server today: a med ending today is Active at 9pm in Los Angeles, Inactive by UTC (AC7 server side)', () => {
  // 2026-11-28 05:00 UTC = 2026-11-27 21:00 in Los Angeles.
  const nowMs = Date.parse('2026-11-28T05:00:00Z');
  const med = { active: true, end_date: '2026-11-27' };
  assertEquals(medicationStatus(med, dateStrInTimezone('America/Los_Angeles', 0, nowMs)), 'Active');
  assertEquals(medicationStatus(med, dateStrInTimezone('UTC', 0, nowMs)), 'Inactive');
});

Deno.test('server today: no saved zone or a bad one falls back to UTC', () => {
  const nowMs = Date.parse('2026-11-28T05:00:00Z');
  for (const tz of [null, undefined, '', 'Not/AZone']) {
    assertEquals(dateStrInTimezone(tz, 0, nowMs), '2026-11-28', `zone ${String(tz)}`);
  }
});

Deno.test('sortCurrentFirst: every row is kept exactly once, malformed rows included', () => {
  const rows = [
    { id: 'off-future', active: false, end_date: '2027-01-01' },
    { id: 'odd', active: true, end_date: '11/02/2026' },
    { id: 'ended', active: true, end_date: '2026-11-26' },
    { id: 'no-flag', end_date: null },
  ];
  const sorted = sortCurrentFirst(rows, TODAY).map((r) => r.id);
  assertEquals(sorted, ['odd', 'off-future', 'ended', 'no-flag']);
  assertEquals(rows.map((r) => medicationStatus(r, TODAY)), ['Inactive', 'Active', 'Inactive', 'Inactive']);
});
