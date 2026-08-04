import { useEffect, useState } from 'react';
import { ChevronRight, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { entities } from '@/api/entities';
import {
  APPETITE_OPTIONS, WATER_OPTIONS, ENERGY_OPTIONS, getMobilityOptions, getBathroomOptions,
} from '@/lib/onboardingConfig';

function labelFor(options, value) {
  return options.find((o) => o.value === value)?.label || null;
}

function Section({ title, onEdit = undefined, children }) {
  return (
    <div className="rounded-2xl bg-card border border-border p-4 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-foreground">{title}</p>
        {onEdit && (
          <button type="button" onClick={onEdit} className="flex items-center gap-0.5 text-sm text-primary min-h-[44px] px-2 -mr-2">
            Edit <ChevronRight className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      {children}
    </div>
  );
}

// Step 5 (spec 0029 FR-006): summarizes everything collected so far, with
// per-section edit links that jump back into the wizard at that step (via
// onJumpToStep, which just moves the wizard's local viewStep — no data is
// re-saved until the user continues forward from there again). Pet
// Information itself isn't jump-editable here: it's created before this
// row-based step machine exists, and stays editable anytime from Pet
// Profile's Edit Profile sheet, same as after onboarding completes.
export default function ReviewCard({ pet, row, conditions, onJumpToStep, onFinish, disabled }) {
  const [meds, setMeds] = useState(null);
  const [vaccinations, setVaccinations] = useState(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      entities.Medication.filter({ pet_id: pet.id }, '-start_date'),
      entities.Vaccination.filter({ pet_id: pet.id }, '-date_given'),
    ]).then(([m, v]) => {
      if (cancelled) return;
      setMeds(m);
      setVaccinations(v);
    });
    return () => { cancelled = true; };
  }, [pet.id]);

  const loading = meds === null || vaccinations === null;

  return (
    <div className="flex flex-col gap-6">
      <div className="space-y-1.5">
        <p className="text-[13px] font-semibold uppercase tracking-widest text-primary/70">Review</p>
        <h2 className="text-2xl font-semibold text-foreground leading-snug">Review your information</h2>
        <p className="text-sm text-muted-foreground">Here's what we've got so far.</p>
      </div>

      <Section title="Pet Information">
        <p className="text-sm text-muted-foreground">
          {pet.name} · {pet.species}{pet.breed ? ` · ${pet.breed}` : ''}
        </p>
      </Section>

      <Section title="Health Conditions" onEdit={() => onJumpToStep('conditions')}>
        <p className="text-sm text-muted-foreground">
          {conditions?.length > 0 ? conditions.join(', ') : 'No known health conditions selected.'}
        </p>
      </Section>

      <Section title="Baseline Habits" onEdit={() => onJumpToStep('appetite')}>
        <ul className="text-sm text-muted-foreground space-y-0.5">
          <li>Appetite: {labelFor(APPETITE_OPTIONS, row.appetite_baseline) || 'Not answered'}</li>
          <li>Water: {labelFor(WATER_OPTIONS, row.water_baseline) || 'Not answered'}</li>
          <li>Energy: {labelFor(ENERGY_OPTIONS, row.energy_baseline) || 'Not answered'}</li>
          <li>Mobility: {labelFor(getMobilityOptions(pet.species), row.mobility_baseline) || 'Not answered'}</li>
          <li>Bathroom: {labelFor(getBathroomOptions(pet.species), row.bathroom_baseline) || 'Not answered'}</li>
        </ul>
      </Section>

      <Section title="Medications" onEdit={() => onJumpToStep('medication_entry')}>
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        ) : meds.length > 0 ? (
          <ul className="text-sm text-muted-foreground space-y-0.5">
            {meds.map((m) => <li key={m.id}>{m.name}{m.dosage ? ` — ${m.dosage}` : ''}</li>)}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No medications have been added yet.</p>
        )}
      </Section>

      <Section title="Vaccinations" onEdit={() => onJumpToStep('vaccinations')}>
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        ) : vaccinations.length > 0 ? (
          <ul className="text-sm text-muted-foreground space-y-0.5">
            {vaccinations.map((v) => <li key={v.id}>{v.vaccine_name}{v.date_given ? ` — ${v.date_given}` : ''}</li>)}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No vaccinations have been added yet.</p>
        )}
      </Section>

      <Button className="w-full min-h-[52px] text-base" disabled={disabled} onClick={onFinish}>
        Finish
      </Button>
    </div>
  );
}
