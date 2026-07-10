import { useState } from 'react';
import PetProfileContent from './PetProfileContent';

// Pets screen card (Nav + Daily Check-In UX Refresh spec #5/#6). The card's
// own identity + wellness-ring circles (from PetProfileContent) ARE the
// collapsed state — no separate lightweight header. Expanding reveals the
// pet-level actions (Share/Edit/Move to Rainbow Bridge/Delete) and the
// Baseline/Conditions/Medications/Food/Vaccinations/Weight/Observations/
// Timeline/Health Records cards, collapsed by default so the Pets tab
// doesn't require navigating away or duplicating PetProfileContent's logic.
export default function ExpandablePetProfileCard({ pet, highlighted = false, cardRef, defaultExpanded = false }) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  return (
    <div
      ref={cardRef}
      className="rounded-2xl px-4 py-4"
      style={{
        background: 'rgba(255,255,255,0.05)',
        border: highlighted ? '1px solid rgba(111,183,255,0.5)' : '1px solid rgba(255,255,255,0.08)',
        boxShadow: highlighted ? '0 0 0 3px rgba(111,183,255,0.15)' : undefined,
      }}
    >
      <PetProfileContent
        petId={pet.id}
        context="pets"
        expanded={expanded}
        onToggleExpanded={() => setExpanded((v) => !v)}
      />
    </div>
  );
}
