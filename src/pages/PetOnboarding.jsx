import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { PartyPopper } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { entities } from '@/api/entities';
import { track } from '@/lib/analytics';
import { getOrCreatePetOnboarding } from '@/lib/onboardingClient';
import OnboardingWizard from '@/components/onboarding/OnboardingWizard';
import OnboardingShell from '@/components/onboarding/OnboardingShell';
import PetInfoCard from '@/components/onboarding/PetInfoCard';
import { OUTER_STEPS } from '@/lib/onboardingConfig';

export default function PetOnboarding() {
  const { petId } = useParams();
  const navigate = useNavigate();
  const [pet, setPet] = useState(null);
  const [row, setRow] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  const load = useCallback(async () => {
    if (petId === 'new') { setLoading(false); return; }
    setLoading(true);
    setLoadError(null);
    try {
      const petData = await entities.Pet.get(petId);
      setPet(petData);

      const { row: onboardingRow, wasCreated } = await getOrCreatePetOnboarding(petId);
      if (wasCreated) track('onboarding_started', { pet_id: petId });
      setRow(onboardingRow);
    } catch (err) {
      console.error('Failed to load onboarding:', err);
      setLoadError("We couldn't load this pet's profile. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [petId]);

  useEffect(() => { if (petId) load(); }, [petId, load]);

  // Step 1 ("Pet Information", spec 0029): the pet — and therefore the
  // pet_onboarding row the rest of this page depends on — doesn't exist
  // yet, so this renders before any of the loading/row logic below runs.
  if (petId === 'new') {
    return (
      <OnboardingShell
        title="Pet Information"
        stepNumber={1}
        totalSteps={OUTER_STEPS.length}
        onClose={() => navigate('/pets')}
        closeLabel="Cancel"
      >
        <PetInfoCard onCreated={(newPetId) => navigate(`/pet/${newPetId}/onboarding`, { replace: true })} />
      </OnboardingShell>
    );
  }

  if (loading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (loadError || !pet || !row) {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center gap-4 bg-background px-6 text-center">
        <p className="text-base text-muted-foreground">{loadError || "We couldn't load this pet's profile."}</p>
        <Button onClick={load}>Try again</Button>
      </div>
    );
  }

  if (row.completed_at) {
    return (
      <CompletionScreen
        petName={pet.name}
        onGoHome={() => navigate('/')}
      />
    );
  }

  return (
    <OnboardingWizard
      pet={pet}
      row={row}
      onRowChange={setRow}
      onComplete={setRow}
    />
  );
}

function CompletionScreen({ petName, onGoHome }) {
  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6 text-center gap-5" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
      <div className="h-16 w-16 rounded-full bg-primary/15 flex items-center justify-center">
        <PartyPopper className="h-8 w-8 text-primary" />
      </div>
      <h1 className="text-3xl font-semibold text-foreground">You're all set!</h1>
      <p className="text-base text-muted-foreground max-w-sm">
        {petName} now has a health profile.
      </p>
      <p className="text-sm text-muted-foreground max-w-sm">
        Every Daily Check-In helps Wysker Watch understand what's normal, recognize changes over time, and build a complete health history for you and your veterinarian.
      </p>
      <div className="flex flex-col gap-3 w-full max-w-sm mt-4">
        <Button className="w-full min-h-[52px] text-base" onClick={onGoHome}>
          Go to Home
        </Button>
      </div>
    </div>
  );
}
