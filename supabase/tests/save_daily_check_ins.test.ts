// Integration test for the save_daily_check_ins database function
// (migration 0034, spec 0016), run against wysker-watch-dev over a real
// Supabase connection — not the app's mocked Vitest suite.
//
// checkinClient.persistence.test.js already covers the *shape* of what
// gets sent to this RPC, but it mocks supabase.rpc entirely and, by its
// own comments, defers the actual "clear old observations before writing
// new ones" guarantee to this function — untested anywhere until now.
// This is the regression test for punch-list item "Direction-read
// defense-in-depth ... is a safety net, not a guarantee" (spec 0042):
// if a future change to save_daily_check_ins ever drops the
// delete-before-insert step, this test fails instead of the bug
// surfacing later as a silently wrong symptom count on a real chart.
//
// Uses a throwaway scratch user + scratch pet (see _shared/testHelpers.ts)
// rather than the shared test1@/test2@ identities, so this never collides
// with the Edge Function integration suite and cleans up after itself via
// cascade delete on the scratch user.
//
// Run: deno test --allow-net --allow-env --node-modules-dir=none supabase/tests/save_daily_check_ins.test.ts

import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { createScratchUser, deleteScratchUser, type ScratchUser } from '../functions/_shared/testHelpers.ts';

async function createPet(owner: ScratchUser, name: string): Promise<string> {
  const { data, error } = await owner.client.from('pets').insert({ name, created_by: owner.userId }).select('id').single();
  if (error || !data) throw new Error(`Failed to create pet: ${error?.message}`);
  return data.id as string;
}

async function getTypeId(owner: ScratchUser, code: string): Promise<string> {
  const { data, error } = await owner.client.from('observation_types').select('id').eq('code', code).single();
  if (error || !data) throw new Error(`Failed to load observation_type '${code}': ${error?.message}`);
  return data.id as string;
}

async function observationsFor(owner: ScratchUser, petId: string, date: string, typeId: string) {
  const { data: checkIn, error: checkInError } = await owner.client
    .from('daily_check_ins')
    .select('id')
    .eq('pet_id', petId)
    .eq('check_in_date', date)
    .single();
  if (checkInError || !checkIn) throw new Error(`Failed to load check-in: ${checkInError?.message}`);

  const { data, error } = await owner.client
    .from('observations')
    .select('value')
    .eq('daily_check_in_id', checkIn.id)
    .eq('observation_type_id', typeId);
  if (error) throw new Error(`Failed to load observations: ${error.message}`);
  return (data ?? []).map((row) => row.value as string);
}

Deno.test('save_daily_check_ins: resaving a day with fewer symptoms removes the ones no longer selected', async () => {
  const owner = await createScratchUser('checkin-cleanup');
  try {
    const petId = await createPet(owner, 'Scratch Cleanup Pet');
    const stoolTypeId = await getTypeId(owner, 'stool');
    const date = '2026-01-15';

    // First save: two distinct stool symptoms the same day — the
    // legitimate multi-symptom case, not a bug (Repo Findings, spec 0042).
    const firstPayload = {
      pet_id: petId,
      check_in_date: date,
      status: 'tough',
      symptom_count: 2,
      completed_at: new Date().toISOString(),
      source: 'app',
      observations: [
        { observation_type_id: stoolTypeId, value: 'diarrhea', numeric_value: null, notes: null, photo_url: null },
        { observation_type_id: stoolTypeId, value: 'blood_noticed', numeric_value: null, notes: null, photo_url: null },
      ],
    };
    const { error: firstError } = await owner.client.rpc('save_daily_check_ins', { payloads: [firstPayload] });
    if (firstError) throw new Error(`First save failed: ${firstError.message}`);

    const afterFirst = await observationsFor(owner, petId, date, stoolTypeId);
    assertEquals(afterFirst.sort(), ['blood_noticed', 'diarrhea']);

    // Second save: same day, corrected down to just one symptom — the
    // "blood_noticed" row must be gone, not left behind alongside the
    // still-current "diarrhea" row.
    const secondPayload = {
      pet_id: petId,
      check_in_date: date,
      status: 'off',
      symptom_count: 1,
      completed_at: new Date().toISOString(),
      source: 'app',
      observations: [
        { observation_type_id: stoolTypeId, value: 'diarrhea', numeric_value: null, notes: null, photo_url: null },
      ],
    };
    const { error: secondError } = await owner.client.rpc('save_daily_check_ins', { payloads: [secondPayload] });
    if (secondError) throw new Error(`Second save failed: ${secondError.message}`);

    const afterSecond = await observationsFor(owner, petId, date, stoolTypeId);
    assertEquals(afterSecond, ['diarrhea']);
  } finally {
    await deleteScratchUser(owner.userId);
  }
});

Deno.test('save_daily_check_ins: resaving a day with a completely different symptom leaves no trace of the old one', async () => {
  const owner = await createScratchUser('checkin-replace');
  try {
    const petId = await createPet(owner, 'Scratch Replace Pet');
    const vomitingTypeId = await getTypeId(owner, 'vomiting');
    const date = '2026-01-16';

    const firstPayload = {
      pet_id: petId,
      check_in_date: date,
      status: 'tough',
      symptom_count: 1,
      completed_at: new Date().toISOString(),
      source: 'app',
      observations: [
        { observation_type_id: vomitingTypeId, value: 'more_than_once', numeric_value: null, notes: null, photo_url: null },
      ],
    };
    const { error: firstError } = await owner.client.rpc('save_daily_check_ins', { payloads: [firstPayload] });
    if (firstError) throw new Error(`First save failed: ${firstError.message}`);
    assertEquals(await observationsFor(owner, petId, date, vomitingTypeId), ['more_than_once']);

    // Corrected: it was actually just a hairball, not repeated vomiting —
    // the old "more_than_once" row must not still be sitting there.
    const secondPayload = {
      pet_id: petId,
      check_in_date: date,
      status: 'off',
      symptom_count: 1,
      completed_at: new Date().toISOString(),
      source: 'app',
      observations: [
        { observation_type_id: vomitingTypeId, value: 'hairball_only', numeric_value: null, notes: null, photo_url: null },
      ],
    };
    const { error: secondError } = await owner.client.rpc('save_daily_check_ins', { payloads: [secondPayload] });
    if (secondError) throw new Error(`Second save failed: ${secondError.message}`);
    assertEquals(await observationsFor(owner, petId, date, vomitingTypeId), ['hairball_only']);
  } finally {
    await deleteScratchUser(owner.userId);
  }
});
