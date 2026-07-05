import { useState, useEffect, useCallback } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { PawPrint, Rainbow, Sparkles, ChevronRight } from 'lucide-react';
import { entities } from '@/api/entities';
import PetCard from '../components/PetCard';
import DailyCheckInSheet from '../components/DailyCheckInSheet';
import PageTransition from '../components/PageTransition';
import usePullToRefresh from '../hooks/usePullToRefresh';
import PullToRefreshIndicator from '../components/PullToRefreshIndicator';
import { useToast } from '@/components/ui/use-toast';
import { getCheckInsForPets, getRecentWellnessForPets, markNormal, markSkipped } from '@/lib/checkin/checkinClient';
import { track } from '@/lib/analytics';

const toDateStr = (d) => d.toISOString().split('T')[0];
const todayStr = () => toDateStr(new Date());
const yesterdayStr = () => toDateStr(new Date(Date.now() - 86400000));

export default function Home() {
  const [pets, setPets] = useState([]);
  const [checkIns, setCheckIns] = useState({}); // pet_id -> today's daily_check_in row
  const [yesterdayCheckIns, setYesterdayCheckIns] = useState({}); // pet_id -> yesterday's row
  const [wellness, setWellness] = useState({}); // pet_id -> { latest, trend }
  const [incompleteOnboardingIds, setIncompleteOnboardingIds] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [pendingPetId, setPendingPetId] = useState(null);
  const [checkInSheet, setCheckInSheet] = useState(null); // { pet, date } | null
  const [dismissedCatchUp, setDismissedCatchUp] = useState(new Set());
  const location = useLocation();
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    if (!location.state?.petDeleted) return;
    const { petName, mode } = location.state;
    const description =
      mode === 'transferred' ? `${petName} has been removed from your account.` :
      mode === 'left' ? `You no longer have access to ${petName}.` :
      `${petName} has been deleted.`;
    toast({ description });
    // Clear the state so refreshing/navigating back doesn't re-show it.
    navigate('.', { replace: true, state: {} });
  }, [location.state, navigate, toast]);

  const loadData = useCallback(async () => {
    setLoading(true);
    const petList = await entities.Pet.list('-created_date');
    setPets(petList);

    if (petList.length) {
      const activePets = petList.filter(p => !p.is_memorial);
      const petIds = activePets.map(p => p.id);

      const [todayRows, yesterdayRows, wellnessByPet] = await Promise.all([
        getCheckInsForPets(petIds, todayStr()),
        getCheckInsForPets(petIds, yesterdayStr()),
        getRecentWellnessForPets(petIds),
      ]);
      setCheckIns(todayRows);
      setYesterdayCheckIns(yesterdayRows);
      setWellness(wellnessByPet);

      // A pet with no onboarding row, or a row that isn't completed yet,
      // still needs "Complete {PetName}'s Profile" surfaced — this is
      // what makes a skipped/interrupted onboarding resumable.
      const onboardingRows = await entities.PetOnboarding.list();
      const completedIds = new Set(onboardingRows.filter(r => r.completed_at).map(r => r.pet_id));
      const incomplete = new Set(petList.filter(p => !p.is_memorial && !completedIds.has(p.id)).map(p => p.id));
      setIncompleteOnboardingIds(incomplete);
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const { isPulling, pullDistance, isRefreshing } = usePullToRefresh(loadData);

  const runAction = async (petId, action) => {
    setPendingPetId(petId);
    try {
      await action();
      await loadData();
    } catch (err) {
      console.error(err);
      toast({ description: 'Unable to save check-in. Please try again.' });
    } finally {
      setPendingPetId(null);
    }
  };

  const handleMarkNormal = (pet) => runAction(pet.id, async () => {
    track('daily_check_in_started', { pet_id: pet.id, check_in_date: todayStr() });
    await markNormal(pet.id, todayStr());
    track('daily_check_in_marked_normal', { pet_id: pet.id, check_in_date: todayStr() });
    track('wellness_score_calculated', { pet_id: pet.id, check_in_date: todayStr(), score: 100 });
  });

  const handleSkip = (pet) => runAction(pet.id, async () => {
    track('daily_check_in_started', { pet_id: pet.id, check_in_date: todayStr() });
    await markSkipped(pet.id, todayStr());
    track('daily_check_in_skipped', { pet_id: pet.id, check_in_date: todayStr() });
  });

  const handleOpenChanged = (pet) => {
    track('daily_check_in_started', { pet_id: pet.id, check_in_date: todayStr() });
    setCheckInSheet({ pet, date: todayStr() });
  };

  const handleCatchUp = (pet, status) => {
    track('catch_up_started', { pet_id: pet.id, check_in_date: yesterdayStr() });
    if (status === 'normal') {
      runAction(pet.id, async () => {
        await markNormal(pet.id, yesterdayStr());
        track('catch_up_completed', { pet_id: pet.id, check_in_date: yesterdayStr(), status: 'normal' });
      });
    } else if (status === 'skipped') {
      runAction(pet.id, async () => {
        await markSkipped(pet.id, yesterdayStr());
        track('catch_up_completed', { pet_id: pet.id, check_in_date: yesterdayStr(), status: 'skipped' });
      });
    } else {
      setCheckInSheet({ pet, date: yesterdayStr(), isCatchUp: true });
    }
  };

  if (loading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  const activePets = pets.filter(p => !p.is_memorial);

  return (
    <PageTransition>
    <div className="min-h-screen pb-28">
      <PullToRefreshIndicator pullDistance={pullDistance} isRefreshing={isRefreshing} />
      <header style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="max-w-2xl mx-auto px-5 py-6">
          <p className="text-[20px] font-semibold tracking-widest uppercase text-primary/70 mb-0.5">Wysker Watch</p>
          <h1 className="text-[28px] font-bold text-foreground tracking-tight leading-tight">Today</h1>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-5">
        {pets.length === 0 ? (
          <div className="text-center py-20">
            <div className="h-20 w-20 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
              <PawPrint className="h-10 w-10 text-primary" />
            </div>
            <h2 className="font-serif text-2xl mb-2">Welcome to Wysker Watch</h2>
            <p className="text-muted-foreground mb-6 max-w-sm mx-auto">
              Track daily symptoms for your cats and dogs with chronic conditions. Spot patterns and share insights with your vet.
            </p>
            <Link to="/pets" className="inline-flex items-center gap-2 rounded-md bg-primary text-primary-foreground px-5 h-10 text-sm font-medium">
              Add a Pet
            </Link>
          </div>
        ) : (
          <div className="space-y-6">
            {activePets.length === 0 && (
              <div className="text-center py-16">
                <Rainbow className="h-8 w-8 mx-auto mb-2 text-purple-300" />
                <p className="text-sm text-muted-foreground">
                  No active pets yet. Visit <Link to="/pets" className="text-primary underline">Pets</Link> to add one.
                </p>
              </div>
            )}
            {activePets.length > 0 && (
              <div className="space-y-3">
                {activePets.map(pet => {
                  const yesterdayRow = yesterdayCheckIns[pet.id];
                  const petCreatedToday = pet.created_at && toDateStr(new Date(pet.created_at)) >= yesterdayStr();
                  const showCatchUp = !yesterdayRow && !petCreatedToday && !dismissedCatchUp.has(pet.id);
                  return (
                    <div key={pet.id} className="space-y-2">
                      <PetCard
                        pet={pet}
                        checkIn={checkIns[pet.id]}
                        wellness={wellness[pet.id]}
                        actionPending={pendingPetId === pet.id}
                        onMarkNormal={() => handleMarkNormal(pet)}
                        onOpenChanged={() => handleOpenChanged(pet)}
                        onSkip={() => handleSkip(pet)}
                      />
                      {incompleteOnboardingIds.has(pet.id) && (
                        <CompleteProfileBanner petId={pet.id} petName={pet.name} />
                      )}
                      {showCatchUp && (
                        <CatchUpPrompt
                          petName={pet.name}
                          pending={pendingPetId === pet.id}
                          onNormal={() => handleCatchUp(pet, 'normal')}
                          onChanged={() => handleCatchUp(pet, 'changed')}
                          onSkip={() => handleCatchUp(pet, 'skipped')}
                          onDismiss={() => setDismissedCatchUp((s) => new Set(s).add(pet.id))}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </main>

      {checkInSheet && (
        <DailyCheckInSheet
          pet={checkInSheet.pet}
          date={checkInSheet.date}
          isCatchUp={checkInSheet.isCatchUp}
          onClose={() => setCheckInSheet(null)}
          onSaved={() => { setCheckInSheet(null); loadData(); }}
        />
      )}
    </div>
    </PageTransition>
  );
}

function CompleteProfileBanner({ petId, petName }) {
  return (
    <Link
      to={`/pet/${petId}/onboarding`}
      className="flex items-center gap-3 rounded-2xl border border-primary/25 bg-primary/10 px-4 py-3.5 active:opacity-80 transition-opacity"
    >
      <div className="h-9 w-9 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
        <Sparkles className="h-4 w-4 text-primary" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-foreground">Complete {petName}'s Profile</p>
        <p className="text-xs text-muted-foreground">Help Wysker Watch learn {petName}'s normal.</p>
      </div>
      <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
    </Link>
  );
}

// Gentle "want to catch up?" prompt for a missed prior day — never a
// blocking modal, never phrased as a failure to log.
function CatchUpPrompt({ petName, onNormal, onChanged, onSkip, onDismiss, pending }) {
  return (
    <div className="rounded-2xl border bg-white/[0.03] px-4 py-3.5" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
      <div className="flex items-start justify-between gap-2 mb-2.5">
        <p className="text-sm font-medium text-white/80">Want to catch up on yesterday for {petName}?</p>
        <button onClick={onDismiss} className="text-xs text-white/30 flex-shrink-0">Not now</button>
      </div>
      <div className="flex items-center gap-2">
        <button disabled={pending} onClick={onNormal} className="flex-1 rounded-xl text-[13px] font-semibold py-2 min-h-[36px] disabled:opacity-40" style={{ background: 'rgba(76,199,176,0.15)', color: '#4CC7B0' }}>
          Yesterday was normal
        </button>
        <button disabled={pending} onClick={onChanged} className="flex-1 rounded-xl text-[13px] font-semibold py-2 min-h-[36px] disabled:opacity-40" style={{ background: 'rgba(255,255,255,0.08)', color: '#fff' }}>
          Something changed
        </button>
        <button disabled={pending} onClick={onSkip} className="rounded-xl text-[13px] font-semibold py-2 px-3 min-h-[36px] disabled:opacity-40 text-white/40 border border-white/10">
          Skip
        </button>
      </div>
    </div>
  );
}
