import { describe, it, expect } from 'vitest';
import { EMERGENCY_KEYWORD_PATTERNS as APP_EMERGENCY, detectEmergencyKeywords as appDetect } from './aiGuardrails';
import { BASELINE_VALUES as APP_BASELINE, NOT_OBSERVED_VALUES as APP_NOT_OBSERVED } from './checkin/checkinClient';
import { COUNTED_CATEGORIES, HEALTH_ATTRIBUTES as APP_HEALTH, WELLBEING_ATTRIBUTES as APP_WELLBEING } from './checkin/config';
import { BLOODWORK_FIELDS as APP_BLOODWORK, URINE_PROTEIN_VALUES as APP_URINE_PROTEIN } from './bloodworkFields';
import { MAX_SHEET_TEXT_CHARS as APP_MAX_SHEET_TEXT_CHARS } from './bloodworkSpreadsheet';
import {
  HEALTH_OPTIONS as APP_HEALTH_OPTIONS, APPETITE_OPTIONS as APP_APPETITE, WATER_OPTIONS as APP_WATER,
  ENERGY_OPTIONS as APP_ENERGY, getMobilityOptions as appMobility, getBathroomOptions as appBathroom,
} from './onboardingConfig';
import { PET_SCREEN_NAMES as APP_SCREENS, getPetContext } from './petScreenContext';
import { RANGE_OPTIONS as APP_RANGES, RANGE_DAYS as APP_RANGE_DAYS } from './checkin/trendsRanges';
import {
  COUNTED_ATTRIBUTES, HEALTH_ATTRIBUTES as SERVER_HEALTH, WELLBEING_ATTRIBUTES as SERVER_WELLBEING,
  BASELINE_VALUES as SERVER_BASELINE, NOT_OBSERVED_VALUES as SERVER_NOT_OBSERVED,
  attributeDaySeries as serverDaySeries,
} from '../../supabase/functions/_shared/checkinRules.ts';
import { observationDaySeries as appDaySeries } from './checkin/observationSeries';
import {
  EMERGENCY_KEYWORD_PATTERNS as SERVER_EMERGENCY, detectEmergencyKeywords as serverDetect,
  BLOODWORK_FIELDS as SERVER_BLOODWORK, HEALTH_OPTIONS as SERVER_HEALTH_OPTIONS,
  APPETITE_OPTIONS as SERVER_APPETITE, WATER_OPTIONS as SERVER_WATER, ENERGY_OPTIONS as SERVER_ENERGY,
  getMobilityOptions as serverMobility, getBathroomOptions as serverBathroom,
  PET_SCREEN_NAMES as SERVER_SCREENS, LEGACY_SCREEN_NAMES as SERVER_LEGACY_SCREENS, URINE_PROTEIN_VALUES as SERVER_URINE_PROTEIN,
} from '../../supabase/functions/ask-vet-assistant/rules.ts';
import {
  TRENDS_RANGES as SERVER_RANGES, MAX_QUESTION_CHARS as SERVER_MAX_QUESTION_CHARS,
  MAX_SHEET_TEXT_CHARS as SERVER_MAX_SHEET_TEXT_CHARS, TASK_NAMES as SERVER_TASKS,
  BLOODWORK_ANSWER_SCHEMA, buildScanBloodwork, buildBloodworkSpreadsheet,
} from '../../supabase/functions/ask-vet-assistant/prompts.ts';
import { MAX_QUESTION_CHARS as APP_MAX_QUESTION_CHARS } from '../api/aiClient';
// context.ts's only non-relative import is a type-only one (stripped when
// Vitest compiles it), so it loads under Node too.
import { RANGE_DAYS as SERVER_RANGE_DAYS } from '../../supabase/functions/ask-vet-assistant/context.ts';

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
      'My cat can\u2019t breathe',
      'he won\u2019t wake up',
      'she can\u2019t pee',
      'he can\u2018t urinate',
      'she won\u02BCt stop bleeding',
      '',
    ];
    for (const text of samples) expect(serverDetect(text)).toBe(appDetect(text));
  });

  it.each([
    ['My cat can\u2019t breathe', 'Difficulty breathing'],
    ['he won\u2019t wake up', 'Collapse'],
    ['she can\u2019t pee', 'Inability to urinate'],
  ])('both detectors catch curly apostrophes: %s', (text, category) => {
    expect(appDetect(text)).toBe(category);
    expect(serverDetect(text)).toBe(category);
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

// Same cases through the Trends cards' per-day rule (app) and the Vet
// Report / AI copy (server). Check-ins are given oldest first, the order
// getObservationTrend passes them in.
const ci = (id, check_in_date, status = 'great') => ({ id, check_in_date, status });
const ob = (daily_check_in_id, value) => ({ daily_check_in_id, value });
const DAY_SERIES_CASES = [
  ['a normal day (only baseline answers)', [ci('a', '2026-11-01')], [ob('a', 'normal'), ob('a', 'none'), ob('a', 'no_change')]],
  ['a completed day with no observation rows', [ci('a', '2026-11-01')], []],
  ['one and two symptoms, with baseline and empty values mixed in',
    [ci('a', '2026-11-01'), ci('b', '2026-11-02')],
    [ob('a', 'ate_little_less'), ob('b', 'ate_much_less'), ob('b', 'ate_more'), ob('b', 'normal'), ob('b', null)]],
  ['a skipped day with symptoms', [ci('a', '2026-11-01', 'skipped'), ci('b', '2026-11-02')], [ob('a', 'ate_much_less'), ob('b', 'ate_more')]],
  ['"Not observed" alongside a symptom', [ci('a', '2026-11-01')], [ob('a', 'more_than_usual'), ob('a', 'not_observed')]],
  ['"Not observed" on its own', [ci('a', '2026-11-01'), ci('b', '2026-11-02')], [ob('a', 'not_observed'), ob('b', 'normal')]],
  ['observations for a check-in not in the list', [ci('a', '2026-11-01')], [ob('other', 'ate_much_less')]],
  ['Off, Tough and unrated days', [ci('a', '2026-11-01', 'off'), ci('b', '2026-11-02', 'tough'), ci('c', '2026-11-03', null)],
    [ob('a', 'ate_little_less'), ob('b', 'normal'), ob('c', 'ate_much_less'), ob('c', 'ate_more')]],
  ['a gap between check-in dates', [ci('a', '2026-11-01'), ci('c', '2026-11-04')], [ob('c', 'lower')]],
  ['no check-ins', [], []],
];

describe('app/server parity: per-day attribute states (Trends cards vs attributeDaySeries)', () => {
  it.each(DAY_SERIES_CASES)('%s', (_name, checkIns, observations) => {
    const app = appDaySeries(checkIns, observations).series;
    expect(serverDaySeries(checkIns, observations)).toEqual(app);
  });

  it('gives the same series whatever the Vibe (spec 0012 v5)', () => {
    const observations = [ob('a', 'ate_little_less'), ob('b', 'ate_much_less'), ob('b', 'ate_more')];
    for (const status of ['great', 'off', 'tough', null]) {
      const checkIns = [ci('a', '2026-11-01', status), ci('b', '2026-11-02', status)];
      expect(appDaySeries(checkIns, observations).series).toEqual([
        { date: '2026-11-01', state: 'observed', count: 1 },
        { date: '2026-11-02', state: 'observed', count: 2 },
      ]);
      expect(serverDaySeries(checkIns, observations)).toEqual(appDaySeries(checkIns, observations).series);
    }
  });
});

describe('app/server parity: bloodwork fields', () => {
  it('has the same key, label and unit for every field, in order', () => {
    const app = APP_BLOODWORK.map(({ key, label, unit }) => ({ key, label, unit }));
    expect(SERVER_BLOODWORK.map(({ key, label, unit }) => ({ key, label, unit }))).toEqual(app);
  });
});

describe('app/server parity: bloodwork scan and spreadsheet answers (spec 0081)', () => {
  it('has the same urine protein answers as the form', () => {
    expect([...SERVER_URINE_PROTEIN]).toEqual(APP_URINE_PROTEIN);
  });

  it("refuses spreadsheet text at the app's limit (60,000 characters)", () => {
    expect(SERVER_MAX_SHEET_TEXT_CHARS).toBe(APP_MAX_SHEET_TEXT_CHARS);
    expect(APP_MAX_SHEET_TEXT_CHARS).toBe(60000);
  });

  it('has bloodwork_spreadsheet as a 9th task', () => {
    expect(SERVER_TASKS).toHaveLength(9);
    expect(SERVER_TASKS).toContain('bloodwork_spreadsheet');
  });

  it("asks both bloodwork tasks for every app field with the app's unit", () => {
    const valueKeys = Object.keys(BLOODWORK_ANSWER_SCHEMA.properties.visits.items.properties.values.properties);
    expect(valueKeys).toEqual(APP_BLOODWORK.map((f) => f.key));
    for (const built of [buildScanBloodwork(), buildBloodworkSpreadsheet('Sheet 1 of 1: S')]) {
      for (const f of APP_BLOODWORK) expect(built.system).toContain(`${f.key} (${f.label}, ${f.unit})`);
    }
  });
});

describe("app/server parity: baseline option labels (onboarding options vs the server's AI baseline summary)", () => {
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
    const paths = ['/pet/p1', '/pet/p1/trends', '/pet/p1/timeline', '/pet/p1/food', '/pet/p1/export', '/pet/p1/profile'];
    const returned = paths.map((p) => getPetContext(p).screen);
    expect([...new Set(returned)].sort()).toEqual([...APP_SCREENS].sort());
  });

  it('no longer has a Weight screen: the Symptoms page is retired (spec 0081)', () => {
    expect(APP_SCREENS).not.toContain('Weight');
    expect([...SERVER_SCREENS]).not.toContain('Weight');
  });

  // The one server-only exception: the server still accepts an old tab's
  // 'Weight' for one release, as Trends (remove with the server's copy).
  it("the server's only legacy screen name is 'Weight', mapped to a current screen", () => {
    expect(SERVER_LEGACY_SCREENS).toEqual({ Weight: 'Trends' });
    for (const target of Object.values(SERVER_LEGACY_SCREENS)) expect(APP_SCREENS).toContain(target);
    for (const name of Object.keys(SERVER_LEGACY_SCREENS)) expect(APP_SCREENS).not.toContain(name);
  });
});

describe('app/server parity: Trends ranges', () => {
  it("has the same range options as the Trends screen's selector", () => {
    expect([...SERVER_RANGES]).toEqual(APP_RANGES);
  });

  it('has the same lookback days for every range (spec 0080)', () => {
    expect({ ...SERVER_RANGE_DAYS }).toEqual(APP_RANGE_DAYS);
    expect(Object.keys(SERVER_RANGE_DAYS)).toEqual([...SERVER_RANGES]);
  });
});

describe('app/server parity: chat question length', () => {
  it("caps the chat boxes at the server's question limit", () => {
    expect(APP_MAX_QUESTION_CHARS).toBe(SERVER_MAX_QUESTION_CHARS);
    expect(APP_MAX_QUESTION_CHARS).toBe(2000);
  });
});
