import { useRef, useState } from 'react';
import { entities } from '@/api/entities';
import { track } from '@/lib/analytics';
import ChoiceCard from './ChoiceCard';
import ConditionsCard from './ConditionsCard';
import MedicationEntryCard from './MedicationEntryCard';
import {
  HEALTH_OPTIONS, MEDICATIONS_YES_NO_OPTIONS, APPETITE_OPTIONS, WATER_OPTIONS, ENERGY_OPTIONS,
  getMobilityOptions, getBathroomOptions, getNextStep, getVisibleSteps,
} from '@/lib/onboardingConfig';

// The onboarding wizard engine. Renders exactly one card per step, saves
// the answer for that step immediately (auto-save + resume requirement),
// and advances using getNextStep's conditional navigation.
export default function OnboardingWizard({ pet, row, onRowChange, onComplete }) {
  const [conditionsDraft, setConditionsDraft] = useState(pet.conditions || []);
  const [saving, setSaving] = useState(false); // drives the disabled-button UI
  const [saveError, setSaveError] = useState(null);
  const petName = pet.name;

  // A useState flag alone isn't a safe re-entrancy gate: two rapid clicks
  // can both read the same stale `saving` value before React re-renders
  // with the update from the first click. A ref is written synchronously,
  // so it closes that window regardless of render timing.
  const savingRef = useRef(false);

  // Core "write this step's answer, then move to whatever's next" logic,
  // shared by every call site. Deliberately does NOT manage saving/guard
  // state itself, so callers that need to bundle an extra write first
  // (e.g. the conditions card also updates pets.conditions) can hold a
  // single guard across both writes instead of nesting two guards.
  const advanceStep = async (patch, currentStep) => {
    const nextRow = { ...row, ...patch };
    const nextStep = getNextStep(currentStep, nextRow);
    const isCompleting = nextStep === 'completed';
    const updated = await entities.PetOnboarding.update(row.id, {
      ...patch,
      current_step: nextStep,
      skipped_at: null, // any forward progress means it's no longer "skipped"
      ...(isCompleting ? { completed_at: new Date().toISOString() } : {}),
    });
    onRowChange(updated);
    track('onboarding_card_completed', { pet_id: pet.id, step: currentStep, next_step: nextStep });
    if (isCompleting) {
      track('onboarding_completed', { pet_id: pet.id });
      onComplete(updated);
    }
  };

  // Runs `fn` under the single re-entrancy guard: a fast double-tap can
  // fire two handlers before React re-renders with the disabled-button
  // state, so the actual gate is the ref (written synchronously),  not
  // the `saving` state (which only drives the UI).
  const withSaveGuard = async (fn) => {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setSaveError(null);
    try {
      await fn();
    } catch (err) {
      console.error('Failed to save onboarding step:', err);
      setSaveError("Couldn't save that — check your connection and try again.");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const saveStep = (patch, currentStep) => withSaveGuard(() => advanceStep(patch, currentStep));

  const visibleSteps = getVisibleSteps(row);
  const stepIndex = visibleSteps.indexOf(row.current_step);
  const progressLabel = stepIndex >= 0 ? `Step ${stepIndex + 1} of ${visibleSteps.length}` : null;

  const renderCard = () => {
    switch (row.current_step) {
      case 'health':
        return (
          <ChoiceCard
            eyebrow="Health"
            title={`Tell us about ${petName}'s health`}
            question={`How would you describe ${petName}'s overall health?`}
            options={HEALTH_OPTIONS(petName)}
            value={row.health_status}
            disabled={saving}
            onSelect={(v) => saveStep({ health_status: v }, 'health')}
          />
        );
      case 'conditions':
        return (
          <ConditionsCard
            petName={petName}
            species={pet.species}
            selected={conditionsDraft}
            onChange={setConditionsDraft}
            disabled={saving}
            onContinue={() => withSaveGuard(async () => {
              await entities.Pet.update(pet.id, { conditions: conditionsDraft });
              await advanceStep({}, 'conditions');
            })}
          />
        );
      case 'medications':
        return (
          <ChoiceCard
            eyebrow="Medications"
            title="Medications"
            question={`Is ${petName} currently taking any medications?`}
            options={MEDICATIONS_YES_NO_OPTIONS}
            value={row.medications_status}
            disabled={saving}
            onSelect={(v) => saveStep({ medications_status: v }, 'medications')}
          />
        );
      case 'medication_entry':
        return (
          <MedicationEntryCard
            petId={pet.id}
            petName={petName}
            disabled={saving}
            onContinue={() => saveStep({}, 'medication_entry')}
            onSkip={() => saveStep({}, 'medication_entry')}
          />
        );
      case 'transition':
        return (
          <div className="flex flex-col items-center text-center gap-5 py-6">
            <span className="text-5xl">🐾</span>
            <h2 className="font-serif text-2xl text-foreground">Every pet has their own normal.</h2>
            <p className="text-base text-muted-foreground max-w-sm">
              The next few questions help Wysker Watch understand what normal looks like for {petName}.
            </p>
            <p className="text-sm text-muted-foreground max-w-sm">
              Later, daily check-ins will only ask what's changed.
            </p>
            <button
              type="button"
              disabled={saving}
              onClick={() => saveStep({}, 'transition')}
              className="w-full mt-2 min-h-[52px] rounded-2xl bg-primary text-primary-foreground font-medium text-base disabled:opacity-60"
            >
              Continue
            </button>
          </div>
        );
      case 'appetite':
        return (
          <ChoiceCard
            eyebrow={`Normally ${petName}...`}
            title="...finishes meals."
            options={APPETITE_OPTIONS}
            value={row.appetite_baseline}
            disabled={saving}
            onSelect={(v) => saveStep({ appetite_baseline: v }, 'appetite')}
          />
        );
      case 'water':
        return (
          <ChoiceCard
            eyebrow={`Normally ${petName}...`}
            title="...drinks water."
            options={WATER_OPTIONS}
            value={row.water_baseline}
            disabled={saving}
            onSelect={(v) => saveStep({ water_baseline: v }, 'water')}
          />
        );
      case 'energy':
        return (
          <ChoiceCard
            eyebrow={`Normally ${petName}...`}
            title="...has energy."
            options={ENERGY_OPTIONS}
            value={row.energy_baseline}
            disabled={saving}
            onSelect={(v) => saveStep({ energy_baseline: v }, 'energy')}
          />
        );
      case 'mobility':
        return (
          <ChoiceCard
            eyebrow={`Normally ${petName}...`}
            title="...moves around."
            options={getMobilityOptions(pet.species)}
            value={row.mobility_baseline}
            disabled={saving}
            onSelect={(v) => saveStep({ mobility_baseline: v }, 'mobility')}
          />
        );
      case 'bathroom':
        return (
          <ChoiceCard
            eyebrow={`Normally ${petName}...`}
            title="...uses the bathroom."
            options={getBathroomOptions(pet.species)}
            value={row.bathroom_baseline}
            disabled={saving}
            onSelect={(v) => saveStep({ bathroom_baseline: v }, 'bathroom')}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-background px-5 pt-8 pb-10" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 32px)' }}>
      <div className="max-w-md mx-auto flex flex-col gap-8">
        {progressLabel && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground text-center">{progressLabel}</p>
            <div className="flex gap-1.5 justify-center">
              {visibleSteps.map((s, i) => (
                <span
                  key={s}
                  className={`h-1.5 rounded-full transition-all ${i <= stepIndex ? 'bg-primary w-6' : 'bg-border w-1.5'}`}
                />
              ))}
            </div>
          </div>
        )}
        {saveError && (
          <p className="text-sm text-destructive text-center" role="alert">{saveError}</p>
        )}
        {renderCard()}
      </div>
    </div>
  );
}
