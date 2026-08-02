import { Button } from '@/components/ui/button';
import ConditionsPicker from './fields/ConditionsPicker';

// Card 2: Known Conditions. Species-specific, searchable, multi-select,
// optional. Selections write straight to pets.conditions (see migration
// 0012 for why there's no separate diagnoses field). Spec 0029 FR-008:
// conditions are grouped under category headers rather than one flat list.
// Spec 0036: the actual picker UI now lives in the shared ConditionsPicker
// (also used by the standalone Conditions page) — this card just supplies
// the wizard-step chrome (eyebrow/title/Continue button) around it.
export default function ConditionsCard({ petName, species, selected, onChange, onContinue, disabled }) {
  return (
    <div className="flex flex-col gap-6">
      <div className="space-y-1.5">
        <p className="text-xs font-semibold uppercase tracking-widest text-primary/70">Known Conditions</p>
        <h2 className="text-2xl font-semibold text-foreground leading-snug">
          Which conditions has {petName} been diagnosed with?
        </h2>
        <p className="text-sm text-muted-foreground">Optional — select any that apply.</p>
      </div>

      <ConditionsPicker species={species} selected={selected} onChange={onChange} disabled={disabled} />

      <Button className="w-full min-h-[52px] text-base" disabled={disabled} onClick={onContinue}>
        Continue
      </Button>
    </div>
  );
}
