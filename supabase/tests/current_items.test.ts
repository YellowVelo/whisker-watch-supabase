// Unit tests for the server copy of the "is this food or medication
// current?" rule (spec 0087, supabase/functions/_shared/currentItems.ts),
// as used by the vet report's Medications table. Pure: no network, no
// logins, no file access. The rule itself is compared with the app's copy
// by src/lib/aiServerParity.test.js (Vitest).
//
// Run: deno test --node-modules-dir=none supabase/tests/current_items.test.ts

import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { medicationStatus, sortCurrentFirst } from '../functions/_shared/currentItems.ts';

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
