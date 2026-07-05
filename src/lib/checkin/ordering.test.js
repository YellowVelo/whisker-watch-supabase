import { describe, it, expect } from 'vitest';
import { orderCheckInCards } from './ordering';

const pet = (id, created_at) => ({ id, created_at });

describe('orderCheckInCards', () => {
  it('surfaces incomplete check-ins before completed ones', () => {
    const pets = [pet('a', '2026-01-01'), pet('b', '2026-01-02')];
    const checkIns = { a: { id: 'ci-a' } }; // a is complete, b is incomplete
    const ordered = orderCheckInCards(pets, checkIns);
    expect(ordered.map((p) => p.id)).toEqual(['b', 'a']);
  });

  it('breaks ties within a group by pet creation date, oldest first', () => {
    const pets = [pet('newer', '2026-02-01'), pet('older', '2026-01-01')];
    const ordered = orderCheckInCards(pets, {}); // both incomplete
    expect(ordered.map((p) => p.id)).toEqual(['older', 'newer']);
  });

  it('does not mutate the input array', () => {
    const pets = [pet('a', '2026-01-01'), pet('b', '2026-01-02')];
    const copy = [...pets];
    orderCheckInCards(pets, {});
    expect(pets).toEqual(copy);
  });
});
