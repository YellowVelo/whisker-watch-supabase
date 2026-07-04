import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { PartyPopper } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { entities } from '@/api/entities';
import { track } from '@/lib/analytics';
import { getOrCreatePetOnboarding } from '@/lib/onboardingClient';
import OnboardingWizard from '@/components/onboarding/OnboardingWizard';

export default function PetOnboarding() {
  const { petId } = useParams();
  const navigate = useNavigate();
  const [pet, setPet] = useState(null);
  const [row, setRow] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  const load = useCallback(async () => {
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
        onStartCheckIn={() => navigate(`/pet/${petId}?startCheckin=1`)}
        onViewProfile={() => navigate(`/pet/${petId}/profile`)}
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

function CompletionScreen({ petName, onStartCheckIn, onViewProfile }) {
  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6 text-center gap-5" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
      <div className="h-16 w-16 rounded-full bg-primary/15 flex items-center justify-center">
        <PartyPopper className="h-8 w-8 text-primary" />
      </div>
      <h1 className="font-serif text-3xl text-foreground">{petName}'s profile is complete!</h1>
      <p className="text-base text-muted-foreground max-w-sm">
        Wysker Watch now understands {petName}'s normal.
      </p>
      <p className="text-sm text-muted-foreground max-w-sm">
        Daily check-ins will usually take less than a minute.
      </p>
      <div className="flex flex-col gap-3 w-full max-w-sm mt-4">
        <Button className="w-full min-h-[52px] text-base" onClick={onStartCheckIn}>
          Start Today's Check-In
        </Button>
        <Button variant="outline" className="w-full min-h-[52px] text-base" onClick={onViewProfile}>
          View {petName}'s Profile
        </Button>
      </div>
    </div>
  );
}
