import { describe, it, expect, vi } from 'vitest';
import React, { createElement, Fragment } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

// Spec 0085 AC1: a saved sit with an unusable date must not crash the Pet
// Sitter page. Vitest runs in plain Node and the page loads its data in an
// effect, so this renders the per-sit card (SitCard) directly to HTML.
vi.mock('@/api/entities', () => ({ entities: {} }));
vi.mock('../InviteSitterDialog', () => ({ default: () => null }));
/** @type {any} */ (globalThis).React = React;
// src/lib/utils.js (imported by the ui primitives) reads window at load time.
if (typeof globalThis.window === 'undefined') {
  /** @type {any} */ (globalThis).window = { self: globalThis, top: globalThis };
}

const { SitCard } = await import('../PetSittingSection.jsx');

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
