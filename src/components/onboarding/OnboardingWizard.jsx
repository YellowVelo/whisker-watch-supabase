import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PawPrint } from 'lucide-react';
import { entities } from '@/api/entities';
import { track } from '@/lib/analytics';
import { Button } from '@/components/ui/button';
import ChoiceCard from './ChoiceCard';
import ConditionsCard from './ConditionsCard';
import MedicationEntryCard from './MedicationEntryCard';
import VaccinationEntryCard from './VaccinationEntryCard';
import ReviewCard from './ReviewCard';
import OnboardingShell from './OnboardingShell';
import {
  HEALTH_OPTIONS, MEDICATIONS_YES_NO_OPTIONS, APPETITE_OPTIONS, WATER_OPTIONS, ENERGY_OPTIONS,
  getMobilityOptions, getBathroomOptions, getNextStep, getVisibleSteps,
  OUTER_STEPS, OUTER_STEP_LABELS, getOuterStep, getOuterStepNumber,
} from '@/lib/onboardingConfig';

// The onboarding wizard engine. Renders exactly one card per step, saves
// the answer for that step immediately (auto-save + resume requirement),
// and advances using getNextStep's conditional navigation. Spec 0029 adds:
// the CatchUpFlow-style full-screen shell, a "Step X of 6" outer progress
// bar, Back (via viewStep, see below), and "Skip for now" at any point.
export default function OnboardingWizard({ pet, row, onRowChange, onComplete }) {
  const navigate = useNavigate();
  const [conditionsDraft, setConditionsDraft] = useState(pet.conditions || []);
  const [saving, setSaving] = useState(false); // drives the disabled-button UI
  const [saveError, setSaveError] = useState(null);
  const petName = pet.name;

  // What's currently rendered — usually equal to row.current_step, but can
  // move backward locally via "Back"/a Review edit-link without touching
  // the persisted current_step (which only moves forward, on a real save).
  // Re-synced to row.current_step whenever a forward save actually lands.
  const [viewStep, setViewStep] = useState(row.current_step);
  useEffect(() => { setViewStep(row.current_step); }, [row.current_step]);

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
  const viewIndex = visibleSteps.indexOf(viewStep);
  // viewIndex is -1 when viewStep was reached via a Review edit-link for a
  // step outside the pet's current conditional path (e.g. jumping into
  // 'conditions' after answering "generally healthy", or 'medication_entry'
  // after answering "no medications") — getVisibleSteps() only lists steps
  // that apply given current answers, so a jumped-to step never appears in
  // it. There's always somewhere to go back to in that case: Review, which
  // is the only place such a jump can originate from.
  const canGoBack = viewIndex > 0 || viewIndex === -1;
  const handleBack = () => {
    if (viewIndex === -1) { setViewStep('review'); return; }
    if (canGoBack) setViewStep(visibleSteps[viewIndex - 1]);
  };

  // "Skip for now" is available from any inner step once the pet (and this
  // row) already exists — same escape hatch AddPetDialog's success screen
  // used to offer once, just no longer limited to that one moment.
  const handleSkip = () => withSaveGuard(async () => {
    track('onboarding_skipped', { pet_id: pet.id, step: viewStep });
    const updated = await entities.PetOnboarding.update(row.id, { skipped_at: new Date().toISOString() });
    onRowChange(updated);
    navigate(`/pets?highlight=${pet.id}`);
  });

  const outerStep = getOuterStep(viewStep);
  const outerStepNumber = getOuterStepNumber(viewStep);

  const renderCard = () => {
    switch (viewStep) {
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
            <PawPrint className="h-12 w-12 text-primary" strokeWidth={1.5} />
            <h2 className="text-2xl font-semibold text-foreground">Every pet has their own normal.</h2>
            <p className="text-base text-muted-foreground max-w-sm">
              The next few questions help Wysker Watch understand what normal looks like for {petName}.
            </p>
            <p className="text-sm text-muted-foreground max-w-sm">
              Later, daily check-ins will only ask what's changed.
            </p>
            <Button
              type="button"
              disabled={saving}
              onClick={() => saveStep({}, 'transition')}
              className="w-full mt-2 min-h-[52px] rounded-2xl text-base"
            >
              Continue
            </Button>
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
      case 'vaccinations':
        return (
          <VaccinationEntryCard
            petId={pet.id}
            petName={petName}
            species={pet.species}
            disabled={saving}
            onContinue={() => saveStep({}, 'vaccinations')}
            onSkip={() => saveStep({}, 'vaccinations')}
          />
        );
      case 'review':
        return (
          <ReviewCard
            pet={pet}
            row={row}
            conditions={conditionsDraft}
            disabled={saving}
            onJumpToStep={setViewStep}
            onFinish={() => saveStep({}, 'review')}
          />
        );
      default:
        return null;
    }
  };

  return (
    <OnboardingShell
      title={OUTER_STEP_LABELS[outerStep]}
      stepNumber={outerStepNumber}
      totalSteps={OUTER_STEPS.length}
      onBack={canGoBack ? handleBack : undefined}
      onClose={handleSkip}
      closeLabel="Skip for now"
    >
      {saveError && (
        <p className="text-sm text-destructive text-center mb-4" role="alert">{saveError}</p>
      )}
      {renderCard()}
    </OnboardingShell>
  );
}
