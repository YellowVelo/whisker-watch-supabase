import { describe, it, expect } from 'vitest';
import { EMERGENCY_KEYWORD_PATTERNS as APP_EMERGENCY, detectEmergencyKeywords as appDetect } from './aiGuardrails';
import { BASELINE_VALUES as APP_BASELINE, NOT_OBSERVED_VALUES as APP_NOT_OBSERVED } from './checkin/checkinClient';
import { COUNTED_CATEGORIES, HEALTH_ATTRIBUTES as APP_HEALTH, WELLBEING_ATTRIBUTES as APP_WELLBEING } from './checkin/config';
import { BLOODWORK_FIELDS as APP_BLOODWORK } from './bloodworkFields';
import {
  HEALTH_OPTIONS as APP_HEALTH_OPTIONS, APPETITE_OPTIONS as APP_APPETITE, WATER_OPTIONS as APP_WATER,
  ENERGY_OPTIONS as APP_ENERGY, getMobilityOptions as appMobility, getBathroomOptions as appBathroom,
} from './onboardingConfig';
import { PET_SCREEN_NAMES as APP_SCREENS, getPetContext } from './petScreenContext';
import {
  COUNTED_ATTRIBUTES, HEALTH_ATTRIBUTES as SERVER_HEALTH, WELLBEING_ATTRIBUTES as SERVER_WELLBEING,
  BASELINE_VALUES as SERVER_BASELINE, NOT_OBSERVED_VALUES as SERVER_NOT_OBSERVED,
} from '../../supabase/functions/_shared/checkinRules.ts';
import {
  EMERGENCY_KEYWORD_PATTERNS as SERVER_EMERGENCY, detectEmergencyKeywords as serverDetect,
  BLOODWORK_FIELDS as SERVER_BLOODWORK, HEALTH_OPTIONS as SERVER_HEALTH_OPTIONS,
  APPETITE_OPTIONS as SERVER_APPETITE, WATER_OPTIONS as SERVER_WATER, ENERGY_OPTIONS as SERVER_ENERGY,
  getMobilityOptions as serverMobility, getBathroomOptions as serverBathroom,
  PET_SCREEN_NAMES as SERVER_SCREENS,
} from '../../supabase/functions/ask-vet-assistant/rules.ts';

// Spec 0080, Before You Approve item 3: some rule lists exist both in the
// app (instant feedback) and on the server (where they're enforced). Edge
// Functions can't import the app's files, so these tests fail the moment
// the two copies differ. Fix by updating both copies, never this test.

const regexShape = (re) => ({ source: re.source, flags: re.flags });
const labelsOnly = (options) => options.map(({ value, label }) => ({ value, label }));

describe('app/server parity: emergency keyword stop (spec 0041)', () => {
  it('has the same categories in the same order', () => {
    expect(SERVER_EMERGENCY.map((c) => c.category)).toEqual(APP_EMERGENCY.map((c) => c.category));
  });

  it.each(APP_EMERGENCY.map((c) => [c.category]))('%s: same regexes (source + flags)', (category) => {
    const app = APP_EMERGENCY.find((c) => c.category === category);
    const server = SERVER_EMERGENCY.find((c) => c.category === category);
    expect(server).toBeDefined();
    expect(server.patterns.map(regexShape)).toEqual(app.patterns.map(regexShape));
  });

  it('both detectors give the same answer for the same text', () => {
    const samples = [
      'My cat collapsed and is not breathing',
      'she ate chocolate an hour ago',
      'he has been straining to pee all day',
      'just a little less hungry today',
      '',
    ];
    for (const text of samples) expect(serverDetect(text)).toBe(appDetect(text));
  });
});

describe('app/server parity: check-in counting lists (spec 0012 v5)', () => {
  it('has the same 11 counted attribute codes, Health then Wellbeing', () => {
    expect([...SERVER_HEALTH]).toEqual(APP_HEALTH);
    expect([...SERVER_WELLBEING]).toEqual(APP_WELLBEING);
    expect([...COUNTED_ATTRIBUTES]).toEqual(COUNTED_CATEGORIES);
    expect(COUNTED_ATTRIBUTES).toHaveLength(11);
  });

  it('has the same normal (baseline) answer values', () => {
    expect([...SERVER_BASELINE].sort()).toEqual([...APP_BASELINE].sort());
  });

  it('has the same not-observed answer values', () => {
    expect([...SERVER_NOT_OBSERVED].sort()).toEqual([...APP_NOT_OBSERVED].sort());
  });
});

describe('app/server parity: bloodwork fields', () => {
  it('has the same key, label and unit for every field, in order', () => {
    const app = APP_BLOODWORK.map(({ key, label, unit }) => ({ key, label, unit }));
    expect(SERVER_BLOODWORK.map(({ key, label, unit }) => ({ key, label, unit }))).toEqual(app);
  });
});

describe('app/server parity: baseline option labels (formatBaselineForAI)', () => {
  it('has the same health status labels', () => {
    expect(SERVER_HEALTH_OPTIONS('Tribble')).toEqual(labelsOnly(APP_HEALTH_OPTIONS('Tribble')));
  });

  it('has the same appetite, water and energy labels', () => {
    expect(labelsOnly(SERVER_APPETITE)).toEqual(labelsOnly(APP_APPETITE));
    expect(labelsOnly(SERVER_WATER)).toEqual(labelsOnly(APP_WATER));
    expect(labelsOnly(SERVER_ENERGY)).toEqual(labelsOnly(APP_ENERGY));
  });

  it.each([['Cat'], ['Dog'], [undefined], ['Rabbit']])('has the same mobility and bathroom labels for species %s', (species) => {
    expect(labelsOnly(serverMobility(species))).toEqual(labelsOnly(appMobility(species)));
    expect(labelsOnly(serverBathroom(species))).toEqual(labelsOnly(appBathroom(species)));
  });
});

describe('app/server parity: Ask Wysker screen names', () => {
  it('has the same screen names', () => {
    expect([...SERVER_SCREENS]).toEqual(APP_SCREENS);
  });

  it("the app's list covers every screen getPetContext can return", () => {
    const paths = ['/pet/p1', '/pet/p1/trends', '/pet/p1/timeline', '/pet/p1/symptoms', '/pet/p1/food', '/pet/p1/export', '/pet/p1/profile'];
    const returned = paths.map((p) => getPetContext(p).screen);
    expect([...new Set(returned)].sort()).toEqual([...APP_SCREENS].sort());
  });
});
