// Today's Check-Ins card ordering (Home Feature Spec #4): incomplete
// check-ins surface before completed ones, tied within each group by
// pet creation date (oldest first). Kept as a pure, standalone function
// — no network calls — so it's independently testable and so Home.jsx
// doesn't need to re-derive this rule inline.
export function orderCheckInCards(pets, checkInsByPetId) {
  return [...pets].sort((a, b) => {
    const aIncomplete = !checkInsByPetId[a.id];
    const bIncomplete = !checkInsByPetId[b.id];
    if (aIncomplete !== bIncomplete) return aIncomplete ? -1 : 1;
    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
  });
}
