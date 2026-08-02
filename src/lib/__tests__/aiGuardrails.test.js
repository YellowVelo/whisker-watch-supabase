import { describe, it, expect } from 'vitest';
import { detectEmergencyKeywords } from '../aiGuardrails';

// Hard-stop emergency detection (spec 0041) — a wrong answer here either
// lets a real emergency reach the AI as an ordinary chat question, or
// blocks an ordinary question that shouldn't be blocked. Sourced directly
// from termsOfServiceContent.js's "Emergency situations" bullet list.
describe('detectEmergencyKeywords', () => {
  it.each([
    ['my dog got into antifreeze', 'Suspected poisoning'],
    ['I think my cat ate rat poison', 'Suspected poisoning'],
    ['she swallowed something and now seems off', 'Suspected poisoning'],
    ["he can't breathe", 'Difficulty breathing'],
    ['having trouble breathing since this morning', 'Difficulty breathing'],
    ['my dog is choking', 'Difficulty breathing'],
    ['he collapsed in the yard', 'Collapse'],
    ["she won't wake up", 'Collapse'],
    ['my cat is having a seizure right now', 'Seizure'],
    ['he keeps seizing', 'Seizure'],
    ['uncontrolled bleeding from his paw', 'Uncontrolled bleeding'],
    ["the cut won't stop bleeding", 'Uncontrolled bleeding'],
    ["my cat can't urinate", 'Inability to urinate'],
    ['straining to pee for an hour', 'Inability to urinate'],
    ['my dog was hit by a car', 'Severe trauma'],
  ])('flags "%s" as an emergency (%s)', (text) => {
    expect(detectEmergencyKeywords(text)).not.toBeNull();
  });

  it.each([
    'what food is best for a senior cat?',
    'how much should a 10lb dog eat per day?',
    'is it normal for my dog to sleep 14 hours a day?',
    'what does a healthy stool look like?',
    '',
    null,
    undefined,
  ])('does not flag ordinary question: %j', (text) => {
    expect(detectEmergencyKeywords(text)).toBeNull();
  });

  // Documents a known, accepted false-positive tradeoff (spec 0041's "Before
  // You Approve This") rather than hiding it: a keyword match is a hard
  // stop, so a resolved/non-urgent sentence that happens to contain a
  // trigger word is deliberately still flagged, in exchange for never
  // missing a real emergency phrased simply.
  it('accepts the known false-positive tradeoff for a resolved, non-urgent mention', () => {
    expect(detectEmergencyKeywords('my cat seems fine after his seizure medication started working last month')).toBe('Seizure');
  });
});
