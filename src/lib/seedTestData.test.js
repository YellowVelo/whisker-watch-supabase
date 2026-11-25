import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Spec 0081 FR17 / AC12: the test/demo seeder writes current tables only.
// Every entity the seeder touches is recorded here, so the tests can check
// what each scenario writes without a database.

const writes = [];
let nextId = 0;

const RETIRED = new Set(['SymptomLog', 'FoodLog', 'WellnessScore']);

// The signed-in account's profile, as entities.Profile.get returns it.
let profile = { timezone: 'UTC' };
let profileError = null;

vi.mock('@/api/supabaseClient', () => ({
  supabase: { auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'owner-1' } } })) } },
}));

const reportClientError = vi.fn();
vi.mock('@/lib/errorMonitoring', () => ({ reportClientError: (...a) => reportClientError(...a) }));

vi.mock('@/api/entities', () => {
  const entities = new Proxy({}, {
    get(_target, name) {
      return {
        create: vi.fn(async (row) => {
          writes.push({ entity: String(name), op: 'create', row });
          return { id: `${String(name)}-${nextId++}`, ...row };
        }),
        update: vi.fn(async (id, row) => {
          writes.push({ entity: String(name), op: 'update', id, row });
          return { id, ...row };
        }),
        get: vi.fn(async (id) => {
          if (String(name) !== 'Profile') throw new Error(`unexpected get on ${String(name)}`);
          if (profileError) throw profileError;
          return { id, ...profile };
        }),
        filter: vi.fn(async () => []),
        list: vi.fn(async () => []),
      };
    },
  });
  return { entities };
});

const checkIns = [];
vi.mock('@/lib/checkin/checkinClient', () => ({
  markGreatDay: vi.fn(async (petId, date) => { checkIns.push({ petId, date, kind: 'great' }); }),
  markSkipped: vi.fn(async (petId, date) => { checkIns.push({ petId, date, kind: 'skipped' }); }),
  markOffTough: vi.fn(async (petId, date, status) => { checkIns.push({ petId, date, kind: status }); }),
}));

const weights = [];
vi.mock('@/lib/weightClient', () => ({
  addWeight: vi.fn(async (petId, { date, lbs }, timezone) => {
    weights.push({ petId, date, lbs, timezone });
    return { id: `w-${weights.length}` };
  }),
}));

// The device's zone, as detectTimezone() reports it. Pinned to a non-UTC
// zone so the fallback tests can tell "used the device zone" apart from a
// hard-coded UTC, whatever zone the machine running the tests is in.
const DEVICE_ZONE = 'Asia/Tokyo';
let deviceZone = DEVICE_ZONE;
vi.mock('@/lib/timezone', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, detectTimezone: () => deviceZone };
});

const { SEED_SCENARIOS, gramsToLbs, GRAMS_PER_LB, makeDaysAgo } = await import('./seedTestData');

const scenario = (key) => SEED_SCENARIOS.find((s) => s.key === key);
const petsCreated = () => writes.filter((w) => w.entity === 'Pet' && w.op === 'create');

beforeEach(() => {
  writes.length = 0;
  checkIns.length = 0;
  weights.length = 0;
  nextId = 0;
  profile = { timezone: 'UTC' };
  profileError = null;
  deviceZone = DEVICE_ZONE;
  reportClientError.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('gramsToLbs', () => {
  it('uses 453.59237 g per lb and rounds to one decimal', () => {
    expect(GRAMS_PER_LB).toBe(453.59237);
    expect(gramsToLbs(29500)).toBe(65.0);
    expect(gramsToLbs(453.59237)).toBe(1);
    expect(gramsToLbs(4536)).toBe(10);
    expect(gramsToLbs(1000)).toBe(2.2);
  });
});

describe('seed scenarios (spec 0081 FR17)', () => {
  it('keeps the same five scenarios for Settings and the demo login', () => {
    expect(SEED_SCENARIOS.map((s) => s.key)).toEqual(['empty', 'healthy_dog', 'multi_pet', 'insights_trends', 'demo_showcase']);
    for (const s of SEED_SCENARIOS) expect(typeof s.run).toBe('function');
    expect(scenario('demo_showcase').audience).toEqual(['demo']);
  });

  it.each(SEED_SCENARIOS.map((s) => [s.key]))('%s never writes a retired table', async (key) => {
    await scenario(key).run();
    const retired = writes.filter((w) => RETIRED.has(w.entity));
    expect(retired).toEqual([]);
  });

  it.each(SEED_SCENARIOS.map((s) => [s.key]))('%s saves at most one weight per pet per day, only through addWeight', async (key) => {
    await scenario(key).run();
    const keys = weights.map((w) => `${w.petId}|${w.date}`);
    expect(new Set(keys).size).toBe(keys.length);
    // No weight written around weightClient (e.g. a raw observation row).
    expect(writes.filter((w) => w.entity === 'Observation')).toEqual([]);
  });

  it('Healthy Dog: Buddy gets 3 Great Day check-ins and a 65.0 lbs weight on each of those days', async () => {
    const pets = await scenario('healthy_dog').run();
    expect(pets).toHaveLength(1);
    const buddy = pets[0];
    expect(buddy.name).toBe('Buddy');

    const buddyCheckIns = checkIns.filter((c) => c.petId === buddy.id);
    expect(buddyCheckIns).toHaveLength(3);
    expect(buddyCheckIns.every((c) => c.kind === 'great')).toBe(true);
    const days = buddyCheckIns.map((c) => c.date);
    expect(new Set(days).size).toBe(3);
    // Oldest first, like a real owner checking in day by day.
    expect([...days].sort()).toEqual(days);

    expect(weights).toHaveLength(3);
    for (const w of weights) {
      expect(w.petId).toBe(buddy.id);
      expect(w.lbs).toBe(65.0);
      expect(w.timezone).toBe(profile.timezone);
    }
    expect(weights.map((w) => w.date).sort()).toEqual([...days].sort());
  });

  it("Healthy Dog: the old meal-log row becomes a current-diet entry ('Adult Dog Formula', dry food)", async () => {
    const [buddy] = await scenario('healthy_dog').run();
    const foods = writes.filter((w) => w.entity === 'PetFood');
    expect(foods).toHaveLength(1);
    expect(foods[0].row).toMatchObject({ pet_id: buddy.id, name: 'Adult Dog Formula', food_type: 'Dry food', active: true });
  });

  it('Multi-Pet Household: one Great Day check-in today per pet, no weights', async () => {
    const pets = await scenario('multi_pet').run();
    expect(pets).toHaveLength(3);
    expect(checkIns).toHaveLength(3);
    expect(new Set(checkIns.map((c) => c.petId))).toEqual(new Set(pets.map((p) => p.id)));
    expect(checkIns.every((c) => c.kind === 'great')).toBe(true);
    expect(new Set(checkIns.map((c) => c.date)).size).toBe(1);
    expect(weights).toEqual([]);
  });

  it("Demo Showcase: each pet gets an 'Adult Formula' current-diet entry", async () => {
    const pets = await scenario('demo_showcase').run();
    const foods = writes.filter((w) => w.entity === 'PetFood').map((w) => w.row);
    expect(foods).toHaveLength(2);
    expect(new Set(foods.map((f) => f.pet_id))).toEqual(new Set(pets.map((p) => p.id)));
    for (const f of foods) expect(f.name).toBe('Adult Formula');
  });

  it('Insights Trends: 3 pets with 30 days of check-ins each, no weights', async () => {
    const pets = await scenario('insights_trends').run();
    expect(pets.map((p) => p.name)).toEqual(['Harper', 'Tribble', 'Auggie']);
    for (const p of pets) {
      const days = checkIns.filter((c) => c.petId === p.id).map((c) => c.date);
      expect(days).toHaveLength(30);
      expect(new Set(days).size).toBe(30);
    }
    expect(weights).toEqual([]);
  });

  it('Empty Account writes nothing', async () => {
    expect(await scenario('empty').run()).toEqual([]);
    expect(writes).toEqual([]);
    expect(petsCreated()).toEqual([]);
  });
});

// Seeded days are calendar dates in the owner's profiles.timezone, not UTC.
describe("seeded dates use the owner's time zone", () => {
  // 9pm on 24 Nov in Los Angeles is already 25 Nov in UTC.
  const US_EVENING = new Date('2026-11-25T05:00:00Z');

  it("Healthy Dog on a US evening: check-ins and weights end on the owner's today, and addWeight gets the owner's zone", async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(US_EVENING);
    profile = { timezone: 'America/Los_Angeles' };

    await scenario('healthy_dog').run();
    expect(checkIns.map((c) => c.date)).toEqual(['2026-11-22', '2026-11-23', '2026-11-24']);
    expect(weights.map((w) => w.date)).toEqual(['2026-11-22', '2026-11-23', '2026-11-24']);
    for (const w of weights) expect(w.timezone).toBe('America/Los_Angeles');
  });

  it("Multi-Pet Household on a US evening checks in on the owner's today, not tomorrow (UTC)", async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(US_EVENING);
    profile = { timezone: 'America/Los_Angeles' };

    await scenario('multi_pet').run();
    expect(checkIns.map((c) => c.date)).toEqual(['2026-11-24', '2026-11-24', '2026-11-24']);
  });

  it('falls back to the device time zone when the profile has none', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(US_EVENING);
    profile = { timezone: null };

    await scenario('healthy_dog').run();
    expect(weights).toHaveLength(3);
    for (const w of weights) expect(w.timezone).toBe(DEVICE_ZONE);
    // 5am UTC on 25 Nov is 2pm on 25 Nov in Tokyo.
    expect(weights.map((w) => w.date)).toEqual(['2026-11-23', '2026-11-24', '2026-11-25']);
    expect(reportClientError).not.toHaveBeenCalled();
  });

  it('falls back to UTC when neither the profile nor the device has a zone', async () => {
    profile = { timezone: null };
    deviceZone = null;

    await scenario('healthy_dog').run();
    expect(weights).toHaveLength(3);
    for (const w of weights) expect(w.timezone).toBe('UTC');
  });

  it('reports a failed profile lookup and still seeds, using the device time zone', async () => {
    profileError = new Error('profile read failed');

    await scenario('healthy_dog').run();
    expect(weights).toHaveLength(3);
    for (const w of weights) expect(w.timezone).toBe(DEVICE_ZONE);
    expect(reportClientError).toHaveBeenCalledWith(profileError, expect.objectContaining({ feature: 'sandbox_seed' }));
  });

  it('30 days of history across a daylight-saving change has 30 different, consecutive days', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    // 11:30pm on 1 Nov 2026 in New York, the night clocks went back.
    vi.setSystemTime(new Date('2026-11-02T04:30:00Z'));
    profile = { timezone: 'America/New_York' };

    const pets = await scenario('insights_trends').run();
    const days = checkIns.filter((c) => c.petId === pets[0].id).map((c) => c.date);
    expect(days).toHaveLength(30);
    expect(new Set(days).size).toBe(30);
    expect(days[29]).toBe('2026-11-01');
    expect(days[0]).toBe('2026-10-03');
  });

  it('makeDaysAgo counts calendar days back (and forward) from today in the given zone', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(US_EVENING);
    const la = makeDaysAgo('America/Los_Angeles');
    expect(la(0)).toBe('2026-11-24');
    expect(la(1)).toBe('2026-11-23');
    expect(la(-275)).toBe('2027-08-26');
    expect(makeDaysAgo('UTC')(0)).toBe('2026-11-25');
  });
});
