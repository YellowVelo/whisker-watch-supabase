import { describe, it, expect, vi, beforeEach } from 'vitest';

// Spec 0081 FR17 / AC12: the test/demo seeder writes current tables only.
// Every entity the seeder touches is recorded here, so the tests can check
// what each scenario writes without a database.

const writes = [];
let nextId = 0;

const RETIRED = new Set(['SymptomLog', 'FoodLog', 'WellnessScore']);

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

const { SEED_SCENARIOS, gramsToLbs, GRAMS_PER_LB } = await import('./seedTestData');

const scenario = (key) => SEED_SCENARIOS.find((s) => s.key === key);
const petsCreated = () => writes.filter((w) => w.entity === 'Pet' && w.op === 'create');

beforeEach(() => {
  writes.length = 0;
  checkIns.length = 0;
  weights.length = 0;
  nextId = 0;
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
      expect(w.timezone).toBe('UTC');
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
