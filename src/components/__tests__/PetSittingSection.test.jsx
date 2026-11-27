import { describe, it, expect, vi } from 'vitest';
import React, { createElement, Fragment } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

// Spec 0085 AC1: a saved sit with an unusable date must not crash the Pet
// Sitter page. Vitest runs in plain Node and the page loads its data in an
// effect, so this renders the per-sit card (SitCard) directly to HTML.
vi.mock('@/api/entities', () => ({ entities: {} }));
vi.mock('../InviteSitterDialog', () => ({ default: () => null }));
vi.mock('@/lib/AuthContext', () => ({ useAuth: () => ({ user: null }) }));
const reportClientError = vi.fn();
vi.mock('@/lib/errorMonitoring', () => ({ reportClientError: (...args) => reportClientError(...args) }));
/** @type {any} */ (globalThis).React = React;
// src/lib/utils.js (imported by the ui primitives) reads window at load time.
if (typeof globalThis.window === 'undefined') {
  /** @type {any} */ (globalThis).window = { self: globalThis, top: globalThis };
}

const { SitCard, saveSit, ensureLogsForSit } = await import('../PetSittingSection.jsx');

const noop = () => {};
const cardProps = (sit, logs = []) => ({
  key: sit.id,
  sit,
  sitPets: [],
  logs,
  expanded: true,
  medicationsByPet: {},
  foodsByPet: {},
  vaccinationsByPet: {},
  onToggleExpand: noop,
  onInvite: noop,
  onEdit: noop,
  onDelete: noop,
  onToggleBool: noop,
  onToggleTask: noop,
});

const renderCards = (...cards) =>
  renderToStaticMarkup(createElement(Fragment, null, ...cards.map(([sit, logs]) => createElement(SitCard, cardProps(sit, logs)))));

const goodSit = { id: 'good', start_date: '2026-12-01', end_date: '2026-12-02' };
const goodLogs = [
  { id: 'l1', date: '2026-12-01' },
  { id: 'l2', date: '2026-12-02' },
];

describe('SitCard with unusable saved dates (spec 0085 AC1)', () => {
  it('shows "Dates not set" for an end date in year 20266, while a good sit beside it shows its dates', () => {
    const badSit = { id: 'bad', start_date: '2026-12-01', end_date: '20266-12-01' };
    let html = '';
    expect(() => { html = renderCards([badSit], [goodSit, goodLogs]); }).not.toThrow();
    expect(html).toContain('Dates not set');
    expect(html).toContain('Dec 1 – Dec 2, 2026');
    // Only the good sit draws a checklist, one row per day.
    expect(html.match(/Daily Checklist/g)).toHaveLength(1);
    expect(html).toContain('Tuesday, December 1');
    expect(html).toContain('Wednesday, December 2');
  });

  it('renders no checklist for a sit starting in year 0202', () => {
    const badSit = { id: 'bad', start_date: '0202-01-01', end_date: '2026-12-01' };
    let html = '';
    expect(() => { html = renderCards([badSit]); }).not.toThrow();
    expect(html).toContain('Dates not set');
    expect(html).not.toContain('Daily Checklist');
  });

  it('renders no checklist for a backwards or over-30-day range', () => {
    const backwards = { id: 'back', start_date: '2026-12-05', end_date: '2026-12-01' };
    const tooLong = { id: 'long', start_date: '2026-12-01', end_date: '2027-01-01' };
    const html = renderCards([backwards], [tooLong]);
    expect(html).not.toContain('Daily Checklist');
    expect(html).not.toContain('loading...');
  });
});

describe('SitCard header actions (spec 0085 T4)', () => {
  it('renders Share/Edit/Delete as labelled 44px IconButtons', () => {
    const html = renderCards([goodSit, goodLogs]);
    for (const label of ['Share with sitter', 'Edit sit', 'Delete sit']) {
      expect(html).toContain(`aria-label="${label}"`);
    }
    const buttons = html.match(/<button[^>]*aria-label="(Share with sitter|Edit sit|Delete sit)"[^>]*>/g) || [];
    expect(buttons).toHaveLength(3);
    for (const b of buttons) expect(b).toMatch(/h-11 w-11/);
  });
});

// Spec 0085 AC4-AC7, AC13: the dialog's Save steps, tested without rendering.
const validForm = {
  sitter_name: 'Sam', start_date: '2026-12-01', end_date: '2026-12-03',
  additional_instructions: '', emergency_contact: '', vet_contact: '', custom_tasks: [],
};
const fakeEntities = (overrides = {}) => ({
  PetSit: {
    create: vi.fn(async (data) => ({ id: 'new-sit', ...data })),
    update: vi.fn(async () => ({})),
    ...overrides.PetSit,
  },
  PetSitLog: {
    filter: vi.fn(async () => []),
    bulkCreate: vi.fn(async () => []),
    ...overrides.PetSitLog,
  },
});

describe('saveSit (spec 0085)', () => {
  it('a date validation message stops every write (AC4-AC6)', async () => {
    for (const [start, end, message] of [
      ['20266-12-01', '2026-12-02', 'Please enter a real date with a 4-digit year.'],
      ['2026-12-05', '2026-12-01', "The end date can't be before the start date."],
      ['2026-12-01', '2027-01-01', 'A pet sit can be up to 30 days. For a longer trip, add a second sit.'],
    ]) {
      const ents = fakeEntities();
      const ensureLogs = vi.fn();
      const result = await saveSit({ form: { ...validForm, start_date: start, end_date: end }, selectedPetIds: ['p1'], editing: null, ents, ensureLogs });
      expect(result.dateError).toBe(message);
      expect(result.sit).toBeNull();
      expect(ents.PetSit.create).not.toHaveBeenCalled();
      expect(ents.PetSit.update).not.toHaveBeenCalled();
      expect(ensureLogs).not.toHaveBeenCalled();
    }
  });

  it('a rejected create returns the error and reports it under pet-sitting (AC7)', async () => {
    reportClientError.mockClear();
    const boom = new Error('network down');
    const ents = fakeEntities({ PetSit: { create: vi.fn(async () => { throw boom; }) } });
    const result = await saveSit({ form: validForm, selectedPetIds: ['p1'], editing: null, ents });
    expect(result.error).toBe(boom);
    expect(result.sit).toBeNull();
    expect(result.dateError).toBeNull();
    expect(reportClientError).toHaveBeenCalledWith(boom, { feature: 'pet-sitting', note: 'create' });
  });

  it('a rejected update is reported with note "update"', async () => {
    reportClientError.mockClear();
    const boom = new Error('db error');
    const ents = fakeEntities({ PetSit: { update: vi.fn(async () => { throw boom; }) } });
    const result = await saveSit({ form: validForm, selectedPetIds: ['p1'], editing: { id: 'old' }, ents });
    expect(result.error).toBe(boom);
    expect(reportClientError).toHaveBeenCalledWith(boom, { feature: 'pet-sitting', note: 'update' });
  });

  it('create OK but checklist failing: the retry updates the same sit, never creates a second (AC13)', async () => {
    reportClientError.mockClear();
    const ents = fakeEntities({ PetSitLog: { bulkCreate: vi.fn(async () => { throw new Error('logs failed'); }) } });
    const first = await saveSit({ form: validForm, selectedPetIds: ['p1'], editing: null, ents });
    expect(first.error).toBeTruthy();
    expect(first.sit?.id).toBe('new-sit');
    expect(ents.PetSit.create).toHaveBeenCalledTimes(1);

    // The component sets editing = first.sit on this outcome.
    ents.PetSitLog.bulkCreate = vi.fn(async () => []);
    const retry = await saveSit({ form: validForm, selectedPetIds: ['p1'], editing: first.sit, ents });
    expect(retry.error).toBeNull();
    expect(ents.PetSit.create).toHaveBeenCalledTimes(1);
    expect(ents.PetSit.update).toHaveBeenCalledWith('new-sit', expect.objectContaining({ start_date: '2026-12-01', pet_ids: ['p1'] }));
    expect(retry.sit.id).toBe('new-sit');
  });

  it('a valid create builds one checklist row per day (30-day span gives 31)', async () => {
    const ents = fakeEntities();
    const result = await saveSit({ form: { ...validForm, start_date: '2026-12-01', end_date: '2026-12-31' }, selectedPetIds: ['p1'], editing: null, ents });
    expect(result.error).toBeNull();
    expect(ents.PetSitLog.bulkCreate).toHaveBeenCalledTimes(1);
    expect(ents.PetSitLog.bulkCreate.mock.calls[0][0]).toHaveLength(31);
  });

  it('ensureLogsForSit skips days that already have a row', async () => {
    const ents = fakeEntities({ PetSitLog: { filter: vi.fn(async () => [{ date: '2026-12-01' }]) } });
    await ensureLogsForSit({ id: 's', pet_ids: ['p1'], start_date: '2026-12-01', end_date: '2026-12-02' }, ents);
    expect(ents.PetSitLog.bulkCreate).toHaveBeenCalledWith([{ pet_sit_id: 's', pet_id: 'p1', date: '2026-12-02' }]);
  });
});

// QA edge cases (spec 0085 QA pass).
describe('saveSit edge cases (spec 0085 QA)', () => {
  it('editing an existing sit to bad dates writes nothing either', async () => {
    const ents = fakeEntities();
    const result = await saveSit({ form: { ...validForm, end_date: '2101-01-01' }, selectedPetIds: ['p1'], editing: { id: 'old' }, ents });
    expect(result.dateError).toBe('Please enter a real date with a 4-digit year.');
    expect(ents.PetSit.update).not.toHaveBeenCalled();
    expect(ents.PetSit.create).not.toHaveBeenCalled();
  });

  it('a valid edit updates (never creates) and adds only the missing days', async () => {
    const ents = fakeEntities({ PetSitLog: { filter: vi.fn(async () => [{ date: '2026-12-01' }]) } });
    const result = await saveSit({ form: { ...validForm, start_date: '2026-12-01', end_date: '2026-12-03' }, selectedPetIds: ['p1', 'p2'], editing: { id: 'old' }, ents });
    expect(result.error).toBeNull();
    expect(ents.PetSit.create).not.toHaveBeenCalled();
    expect(ents.PetSit.update).toHaveBeenCalledWith('old', expect.objectContaining({ pet_ids: ['p1', 'p2'], end_date: '2026-12-03' }));
    expect(ents.PetSitLog.bulkCreate).toHaveBeenCalledWith([
      { pet_sit_id: 'old', pet_id: 'p1', date: '2026-12-02' },
      { pet_sit_id: 'old', pet_id: 'p1', date: '2026-12-03' },
    ]);
  });

  it('a one-day sit builds exactly one checklist row', async () => {
    const ents = fakeEntities();
    await saveSit({ form: { ...validForm, start_date: '2026-12-31', end_date: '2026-12-31' }, selectedPetIds: ['p1'], editing: null, ents });
    expect(ents.PetSitLog.bulkCreate.mock.calls[0][0]).toEqual([{ pet_sit_id: 'new-sit', pet_id: 'p1', date: '2026-12-31' }]);
  });

  it('a network failure loading existing checklist rows is reported and keeps the new sit for retry', async () => {
    reportClientError.mockClear();
    const ents = fakeEntities({ PetSitLog: { filter: vi.fn(async () => { throw new TypeError('Failed to fetch'); }) } });
    const result = await saveSit({ form: validForm, selectedPetIds: ['p1'], editing: null, ents });
    expect(result.sit?.id).toBe('new-sit');
    expect(result.error).toBeInstanceOf(TypeError);
    expect(reportClientError).toHaveBeenCalledWith(result.error, { feature: 'pet-sitting', note: 'create' });
  });

  it('ensureLogsForSit never builds rows for a bad saved range', async () => {
    for (const sit of [
      { id: 's', pet_ids: ['p1'], start_date: '0202-01-01', end_date: '2026-12-01' },
      { id: 's', pet_ids: ['p1'], start_date: '2026-12-05', end_date: '2026-12-01' },
      { id: 's', pet_ids: ['p1'], start_date: '2026-12-01', end_date: '20266-12-01' },
    ]) {
      const ents = fakeEntities();
      await ensureLogsForSit(sit, ents);
      expect(ents.PetSitLog.filter).not.toHaveBeenCalled();
      expect(ents.PetSitLog.bulkCreate).not.toHaveBeenCalled();
    }
  });
});

describe('SitCard: several sits, one with no dates (spec 0085 QA)', () => {
  it('a sit with both dates missing, beside a sit crossing New Year, renders without throwing', () => {
    const empty = { id: 'empty', start_date: null, end_date: null };
    const newYear = { id: 'ny', start_date: '2026-12-31', end_date: '2027-01-01' };
    let html = '';
    expect(() => { html = renderCards([empty], [newYear, [{ id: 'a', date: '2026-12-31' }, { id: 'b', date: '2027-01-01' }]]); }).not.toThrow();
    expect(html).toContain('Dates not set');
    expect(html).toContain('Dec 31 – Jan 1, 2027');
    expect(html).toContain('Thursday, December 31');
    expect(html).toContain('Friday, January 1');
  });
});

// Spec 0087 AC1, AC2: the card lists only current foods and medications
// (switched on and not past their end date on the viewer's calendar). The
// card is the same component on an owner's and a sitter's Pet Sitter page.
describe('SitCard lists only current foods and medications (spec 0087)', () => {
  const TODAY = '2026-11-27';
  const pet = { id: 'p1', name: 'Tribble' };
  const sit = { id: 's1', start_date: '2026-11-27', end_date: '2026-11-27' };
  const logs = [{ id: 'l1', date: '2026-11-27' }];
  const foodsByPet = {
    p1: [
      { id: 'f1', name: 'Current Kibble', active: true, end_date: null },
      { id: 'f2', name: 'Old Kibble', active: true, end_date: '2026-11-26' },
      { id: 'f3', name: 'Last Day Kibble', active: true, end_date: TODAY },
    ],
  };
  const render = (medicationsByPet) => renderToStaticMarkup(createElement(SitCard, {
    ...cardProps(sit, logs), sitPets: [pet], foodsByPet, medicationsByPet, todayStr: TODAY,
  }));

  // Owners and sitters both see this one SitCard (PetSittingSection has no
  // per-role card), so one render covers both views.
  it('drops a food and a med that ended yesterday (owner and sitter views)', () => {
    const html = render({
      p1: [
        { id: 'm1', name: 'Current Pill', active: true, end_date: null, frequency: 'Once daily' },
        { id: 'm2', name: 'Old Pill', active: true, end_date: '2026-11-26', frequency: 'Once daily' },
      ],
    });
    expect(html).toContain('Current Kibble');
    expect(html).toContain('Last Day Kibble');
    expect(html).not.toContain('Old Kibble');
    expect(html).toContain('Current Pill');
    expect(html).not.toContain('Old Pill');
  });

  it("a finished twice-daily med doesn't add the PM Meds button", () => {
    const html = render({
      p1: [
        { id: 'm1', name: 'Current Pill', active: true, end_date: null, frequency: 'Once daily' },
        { id: 'm2', name: 'Old Pill', active: true, end_date: '2026-11-26', frequency: 'Twice daily' },
      ],
    });
    expect(html).toContain('AM Meds');
    expect(html).not.toContain('PM Meds');
  });

  it('shows the PM Meds button for a current twice-daily med', () => {
    const html = render({ p1: [{ id: 'm1', name: 'Current Pill', active: true, end_date: TODAY, frequency: 'Twice daily' }] });
    expect(html).toContain('PM Meds');
  });

  it('only finished meds: no Medications list and no meds buttons', () => {
    const html = render({ p1: [{ id: 'm2', name: 'Old Pill', active: true, end_date: '2026-11-26', frequency: 'Twice daily' }] });
    expect(html).not.toContain('Medications:');
    expect(html).not.toContain('AM Meds');
    expect(html).not.toContain('PM Meds');
  });
});
