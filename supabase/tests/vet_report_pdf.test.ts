// End-to-end check of the Vet Report's Wellness Overview (spec 0080, PA-12,
// AC10/AC11, FR14-FR17), run against generate-vet-report DEPLOYED on
// wysker-watch-dev. vet_report_wellness.test.ts tests the data shaping as a
// pure function; this one proves the real PDF the function returns says
// the right thing for check-ins saved through the app's own save path
// (the save_daily_check_ins RPC, called as the owner).
//
// Seeded on a scratch owner with no saved time zone, so the report's
// 30-day window is on the UTC calendar (today and the 29 days before):
//   - 1 day ago   Great  Appetite "ate a little less"; Bathroom "not observed"
//   - 2 days ago  Off    Appetite "ate a little less"
//   - 3 days ago  Tough  Appetite "ate much less"; Stool "diarrhea"
//   - 4 days ago  Skipped
//   - 5 days ago  Great  all normal
//   - 40 days ago Off    Mood / Behavior "hiding more" (outside the window)
// Water is Normal on every completed day.
//
// Expected: heading "Wellness Overview" with the window's dates; Vibe line
// Great Day 2 · Off Day 1 · Tough Day 1 · Skipped 1 · No check-in 25;
// Appetite and Stool listed with their day counts; Water (all normal),
// Bathroom (only "not observed") and Mood / Behavior (outside the window)
// not listed; no "Health Score" anywhere. A second pet with no check-ins
// gets the "No daily check-ins" empty state, and a stranger gets 403.
//
// Runs a few seconds after UTC midnight could see the window shift by a
// day between seeding and the request; the offsets above leave room.
//
// Users are created and signed in once for the file (Supabase Auth limits
// sign-ins per IP). The service role only cleans up.
//
// Run (dev): deno test --allow-net --allow-env --node-modules-dir=none supabase/tests/vet_report_pdf.test.ts

import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  adminClient,
  createScratchUser,
  deleteScratchUser,
  functionsUrl,
  requireEnv,
  type ScratchUser,
} from '../functions/_shared/testHelpers.ts';

const FN = 'generate-vet-report';

function utcDate(offsetDays = 0): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

function shortDate(date: string, withYear: boolean): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', ...(withYear ? { year: 'numeric' as const } : {}), timeZone: 'UTC',
  });
}

async function inflate(bytes: Uint8Array): Promise<Uint8Array | null> {
  try {
    const stream = new Blob([new Uint8Array(bytes)]).stream().pipeThrough(new DecompressionStream('deflate'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  } catch {
    return null;
  }
}

// pdf-lib (standard fonts) writes text as hex strings, `<48656C6C6F> Tj`,
// inside Flate-compressed content streams, in WinAnsi encoding. Returns
// every shown string, in drawing order.
async function pdfTextPieces(pdf: Uint8Array): Promise<string[]> {
  const latin1 = new TextDecoder('latin1');
  const raw = latin1.decode(pdf);
  const winAnsi = new TextDecoder('windows-1252');
  const sources: string[] = [raw];
  const streamRe = /stream\r?\n/g;
  let m: RegExpExecArray | null;
  while ((m = streamRe.exec(raw))) {
    const start = m.index + m[0].length;
    let end = raw.indexOf('endstream', start);
    if (end < 0) break;
    const next = end;
    // The line break before "endstream" isn't part of the data, and
    // DecompressionStream refuses trailing bytes.
    while (end > start && (raw[end - 1] === '\n' || raw[end - 1] === '\r')) end--;
    const inflated = await inflate(pdf.subarray(start, end));
    if (inflated) sources.push(latin1.decode(inflated));
    streamRe.lastIndex = next + 'endstream'.length;
  }
  const pieces: string[] = [];
  for (const src of sources) {
    for (const t of src.matchAll(/<([0-9A-Fa-f\s]*)>\s*Tj/g)) {
      const hex = t[1].replace(/\s/g, '');
      const bytes = new Uint8Array(hex.length / 2);
      for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
      pieces.push(winAnsi.decode(bytes));
    }
    for (const t of src.matchAll(/\(((?:\\.|[^\\)])*)\)\s*Tj/g)) pieces.push(t[1]);
  }
  return pieces;
}

async function downloadReport(user: ScratchUser, petId: string): Promise<{ status: number; date: string; type: string; bytes: Uint8Array }> {
  const res = await fetch(functionsUrl(FN), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${user.accessToken}`,
      apikey: requireEnv('SUPABASE_ANON_KEY'),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ petId, format: 'pdf' }),
  });
  return { status: res.status, date: res.headers.get('Date') ?? '', type: res.headers.get('Content-Type') ?? '', bytes: new Uint8Array(await res.arrayBuffer()) };
}

Deno.test('generate-vet-report: Wellness Overview from real check-ins (spec 0080)', async (t) => {
  const [owner, stranger] = await Promise.all([
    createScratchUser('vetreport-owner'),
    createScratchUser('vetreport-stranger'),
  ]);
  const admin = adminClient();
  const petIds: string[] = [];

  try {
    const newPet = async (name: string): Promise<string> => {
      const { data, error } = await owner.client
        .from('pets').insert({ name, created_by: owner.userId, species: 'Cat' }).select('id').single();
      if (error || !data) throw new Error(`pet insert failed: ${error?.message}`);
      petIds.push(data.id as string);
      return data.id as string;
    };
    const petId = await newPet('Vet Report QA Pet');
    const emptyPetId = await newPet('Vet Report QA Empty Pet');

    const { data: types, error: typesError } = await owner.client.from('observation_types').select('id, code');
    if (typesError || !types) throw new Error(`observation_types failed: ${typesError?.message}`);
    const typeId = (code: string) => {
      const row = types.find((r) => r.code === code);
      if (!row) throw new Error(`no observation_type ${code}`);
      return row.id as string;
    };
    const obs = (code: string, value: string) => ({
      observation_type_id: typeId(code), value, numeric_value: null, notes: null, photo_url: null,
    });
    const normals = (except: string[]) =>
      ['appetite', 'water_intake', 'bathroom', 'stool', 'energy']
        .filter((c) => !except.includes(c))
        .map((c) => obs(c, 'normal'));
    const day = (offset: number, status: string, observations: ReturnType<typeof obs>[], symptomCount: number) => ({
      pet_id: petId,
      check_in_date: utcDate(offset),
      status,
      symptom_count: symptomCount,
      completed_at: new Date().toISOString(),
      source: 'app',
      observations,
    });

    const payloads = [
      day(-1, 'great', [obs('appetite', 'ate_little_less'), obs('bathroom', 'not_observed'), ...normals(['appetite', 'bathroom'])], 1),
      day(-2, 'off', [obs('appetite', 'ate_little_less'), ...normals(['appetite'])], 1),
      day(-3, 'tough', [obs('appetite', 'ate_much_less'), obs('stool', 'diarrhea'), ...normals(['appetite', 'stool'])], 2),
      day(-4, 'skipped', [], 0),
      day(-5, 'great', normals([]), 0),
      day(-40, 'off', [obs('behavior', 'hiding_more'), ...normals([])], 1),
    ];
    const { error: saveError } = await owner.client.rpc('save_daily_check_ins', { payloads });
    if (saveError) throw new Error(`save_daily_check_ins failed: ${saveError.message}`);

    await t.step('AC10: the overview shows the window, Vibe totals and only attributes with symptoms', async () => {
      const res = await downloadReport(owner, petId);
      assertEquals(res.status, 200, `expected 200, got ${res.status}: ${new TextDecoder().decode(res.bytes).slice(0, 300)}`);
      assert(res.type.includes('application/pdf'), `expected a PDF, got ${res.type}`);
      assertEquals(new TextDecoder().decode(res.bytes.subarray(0, 5)), '%PDF-');

      const pieces = await pdfTextPieces(res.bytes);
      const text = pieces.join(' ').replace(/\s+/g, ' ');
      const tight = pieces.join('').replace(/\s+/g, ' ');
      const has = (s: string) => text.includes(s) || tight.includes(s);
      // Just the Wellness Overview: from its heading to the next section's.
      // (The unchanged 180-day "Daily Observations" table lists every
      // non-normal answer, "Not observed" included, so it's excluded here.)
      const section = (full: string) => {
        const from = full.indexOf('Wellness Overview');
        const to = full.indexOf('Baselines & Deviations', from);
        return from < 0 ? '' : full.slice(from, to < 0 ? undefined : to);
      };
      const inOverview = (s: string) => section(text).includes(s) || section(tight).includes(s);

      assert(has('Wellness Overview'), `missing the Wellness Overview heading in: ${tight.slice(0, 700)}`);
      const start = utcDate(-29);
      const end = utcDate(0);
      const window = `last 30 days (${shortDate(start, start.slice(0, 4) !== end.slice(0, 4))} – ${shortDate(end, true)})`;
      assert(has(window), `missing the window text "${window}" in: ${tight.slice(0, 700)}`);

      assert(has('How the days went'), 'missing the Vibe label');
      for (const part of ['Great Day 2', 'Off Day 1', 'Tough Day 1', 'Skipped 1', 'No check-in 25']) {
        assert(has(part), `missing Vibe total "${part}"`);
      }
      assert(!has('Not recorded'), '"Not recorded" should only appear when there are unrated days');

      assert(has('Symptoms logged'), 'missing the symptoms label');
      assert(has('Appetite'), 'Appetite had symptoms and should be listed');
      assert(has('Ate a little less (2 days)'), 'Appetite: expected "Ate a little less (2 days)"');
      assert(has('Ate much less (1 day)'), 'Appetite: expected "Ate much less (1 day)"');
      assert(has('Stool'), 'Stool had a symptom and should be listed');
      assert(has('Diarrhea (1 day)'), 'Stool: expected "Diarrhea (1 day)"');

      // All-normal, only-"not observed", and outside-the-window attributes
      // get no chart.
      assert(inOverview('Appetite') && inOverview('Stool'), 'Appetite and Stool should be in the overview itself');
      assert(!inOverview('Water'), 'Water stayed Normal and should not be listed');
      assert(!inOverview('Bathroom'), 'Bathroom was only "not observed" and should not be listed');
      assert(!inOverview('Mood / Behavior') && !inOverview('Hiding more'), 'a symptom 40 days ago is outside the window');

      assert(has('Blank = skipped, no check-in, or not observed'), 'missing the chart legend');
      assert(!/health score/i.test(text) && !/health score/i.test(tight), 'the report must not mention a Health Score');
    });

    await t.step('a pet with no check-ins gets the "No daily check-ins" empty state', async () => {
      const res = await downloadReport(owner, emptyPetId);
      assertEquals(res.status, 200);
      const pieces = await pdfTextPieces(res.bytes);
      const text = pieces.join(' ').replace(/\s+/g, ' ');
      const tight = pieces.join('').replace(/\s+/g, ' ');
      const phrase = 'No daily check-ins were recorded in the last 30 days.';
      assert(text.includes(phrase) || tight.includes(phrase), 'missing the no-check-ins empty state');
      assert(!/health score/i.test(text) && !/health score/i.test(tight), 'the report must not mention a Health Score');
    });

    await t.step("a stranger can't get the report (403)", async () => {
      const res = await downloadReport(stranger, petId);
      assertEquals(res.status, 403);
      assert(!new TextDecoder().decode(res.bytes).includes('Vet Report QA Pet'), 'refusal leaked the pet name');
    });
  } finally {
    // Check-ins and observations cascade with the pet.
    if (petIds.length) await admin.from('pets').delete().in('id', petIds);
    await deleteScratchUser(owner.userId);
    await deleteScratchUser(stranger.userId);
  }
});
