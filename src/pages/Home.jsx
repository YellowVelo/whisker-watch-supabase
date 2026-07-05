import { useState, useEffect, useCallback, useRef } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { PawPrint, Sparkles, ChevronRight, CalendarClock } from 'lucide-react';
import { entities } from '@/api/entities';
import WellnessCard from '../components/WellnessCard';
import CheckInCard from '../components/CheckInCard';
import NotificationBell from '../components/NotificationBell';
import DailyCheckInSheet from '../components/DailyCheckInSheet';
import PageTransition from '../components/PageTransition';
import usePullToRefresh from '../hooks/usePullToRefresh';
import PullToRefreshIndicator from '../components/PullToRefreshIndicator';
import { useToast } from '@/components/ui/use-toast';
import {
  getCheckInsForPets, getRecentWellnessForPets, getObservationSummariesForCheckIns,
  getCheckIn, getLatestWellness,
} from '@/lib/checkin/checkinClient';
import { orderCheckInCards } from '@/lib/checkin/ordering';
import { getUnreadCount } from '@/lib/notifications/notificationClient';
import { buildGreeting } from '@/lib/greeting';
import { useAuth } from '@/lib/AuthContext';
import { track } from '@/lib/analytics';

const toDateStr = (d) => d.toISOString().split('T')[0];
const todayStr = () => toDateStr(new Date());
const yesterdayStr = () => toDateStr(new Date(Date.now() - 86400000));

export default function Home() {
  const { user } = useAuth();
  const [pets, setPets] = useState([]);
  const [checkIns, setCheckIns] = useState({}); // pet_id -> today's daily_check_in row
  const [yesterdayCheckIns, setYesterdayCheckIns] = useState({}); // pet_id -> yesterday's row
  const [wellness, setWellness] = useState({}); // pet_id -> { latest, trend }
  const [observationSummaries, setObservationSummaries] = useState({}); // pet_id -> string[]
  const [incompleteOnboardingIds, setIncompleteOnboardingIds] = useState(new Set());
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [stale, setStale] = useState(false);
  const [checkInSheet, setCheckInSheet] = useState(null); // { pet, date, isCatchUp? } | null
  const hasLoadedOnceRef = useRef(false);
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
    navigate('.', { replace: true, state: {} });
  }, [location.state, navigate, toast]);

  const loadData = useCallback(async () => {
    try {
      const petList = await entities.Pet.list('-created_date');
      setPets(petList);

      const activePets = petList.filter((p) => !p.is_memorial);
      const petIds = activePets.map((p) => p.id);

      if (petIds.length) {
        const [todayRows, yesterdayRows, wellnessByPet, unread] = await Promise.all([
          getCheckInsForPets(petIds, todayStr()),
          getCheckInsForPets(petIds, yesterdayStr()),
          getRecentWellnessForPets(petIds),
          getUnreadCount(),
        ]);
        setCheckIns(todayRows);
        setYesterdayCheckIns(yesterdayRows);
        setWellness(wellnessByPet);
        setUnreadCount(unread);
        setObservationSummaries(await getObservationSummariesForCheckIns(todayRows));

        // A pet with no onboarding row, or a row that isn't completed yet,
        // still needs "Complete {PetName}'s Profile" surfaced.
        const onboardingRows = await entities.PetOnboarding.list();
        const completedIds = new Set(onboardingRows.filter((r) => r.completed_at).map((r) => r.pet_id));
        setIncompleteOnboardingIds(new Set(activePets.filter((p) => !completedIds.has(p.id)).map((p) => p.id)));
      } else {
        setCheckIns({});
        setYesterdayCheckIns({});
        setWellness({});
        setObservationSummaries({});
        setIncompleteOnboardingIds(new Set());
        setUnreadCount(await getUnreadCount());
      }
      setLoadError(false);
      setStale(false);
    } catch (err) {
      console.error(err);
      if (hasLoadedOnceRef.current) {
        setStale(true); // keep showing cached data
      } else {
        setLoadError(true);
      }
    } finally {
      hasLoadedOnceRef.current = true;
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const { isPulling, pullDistance, isRefreshing } = usePullToRefresh(loadData);

  // "Refresh only the affected pet card after a Daily Check-In or
  // Catch-Up Check-In completes instead of reloading the entire
  // screen" (Home Feature Spec, Implementation Notes) — re-fetches just
  // this one pet's check-in/wellness/observation/onboarding data and
  // merges it into state, rather than re-running loadData() for every
  // pet on the screen.
  const refreshPetCard = useCallback(async (pet) => {
    const [todayRow, yesterdayRow, wellnessResult, onboardingRows] = await Promise.all([
      getCheckIn(pet.id, todayStr()),
      getCheckIn(pet.id, yesterdayStr()),
      getLatestWellness(pet.id),
      entities.PetOnboarding.filter({ pet_id: pet.id }),
    ]);
    const summaries = await getObservationSummariesForCheckIns({ [pet.id]: todayRow });

    setCheckIns((prev) => ({ ...prev, [pet.id]: todayRow }));
    setYesterdayCheckIns((prev) => ({ ...prev, [pet.id]: yesterdayRow }));
    setWellness((prev) => ({ ...prev, [pet.id]: wellnessResult }));
    setObservationSummaries((prev) => ({ ...prev, [pet.id]: summaries[pet.id] || [] }));
    setIncompleteOnboardingIds((prev) => {
      const next = new Set(prev);
      const completed = onboardingRows.some((r) => r.completed_at);
      if (completed) next.delete(pet.id); else next.add(pet.id);
      return next;
    });
  }, []);

  const handleStartCheckIn = (pet) => {
    track('daily_check_in_started', { pet_id: pet.id, check_in_date: todayStr() });
    setCheckInSheet({ pet, date: todayStr() });
  };

  const handleCatchUp = (pet) => {
    track('catch_up_started', { pet_id: pet.id, check_in_date: yesterdayStr() });
    setCheckInSheet({ pet, date: yesterdayStr(), isCatchUp: true });
  };

  const activePets = pets.filter((p) => !p.is_memorial);

  // Only the single most recent missed day is surfaced on Home, for the
  // first pet (in display order) that qualifies.
  const catchUpPet = activePets.find((pet) => {
    if (yesterdayCheckIns[pet.id]) return false;
    const petCreatedToday = pet.created_at && toDateStr(new Date(pet.created_at)) >= yesterdayStr();
    return !petCreatedToday;
  });

  const greeting = buildGreeting(user?.first_name);
  const orderedCheckInPets = orderCheckInCards(activePets, checkIns);

  if (loading) {
    return (
      <PageTransition>
        <div className="min-h-screen pb-28">
          <header style={{ paddingTop: 'env(safe-area-inset-top)' }}>
            <div className="max-w-2xl mx-auto px-5 py-6 flex items-start justify-between gap-3">
              <div className="space-y-2 flex-1">
                <div className="h-4 w-40 rounded-full animate-pulse" style={{ background: 'rgba(255,255,255,0.06)' }} />
                <div className="h-7 w-56 rounded-full animate-pulse" style={{ background: 'rgba(255,255,255,0.08)' }} />
              </div>
              <div className="h-11 w-11 rounded-full animate-pulse flex-shrink-0" style={{ background: 'rgba(255,255,255,0.06)' }} />
            </div>
          </header>
          <main className="max-w-2xl mx-auto px-4 py-2 space-y-6">
            <div className="flex gap-3 overflow-x-auto">
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex-shrink-0 w-[140px] h-[160px] rounded-2xl animate-pulse" style={{ background: 'rgba(255,255,255,0.05)' }} />
              ))}
            </div>
            <div className="space-y-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-24 rounded-2xl animate-pulse" style={{ background: 'rgba(255,255,255,0.05)' }} />
              ))}
            </div>
          </main>
        </div>
      </PageTransition>
    );
  }

  return (
    <PageTransition>
    <div className="min-h-screen pb-28">
      <PullToRefreshIndicator pullDistance={pullDistance} isRefreshing={isRefreshing} />
      <header style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="max-w-2xl mx-auto px-5 py-6 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[15px] text-white/50">{greeting}</p>
            <h1 className="text-[26px] font-bold text-foreground tracking-tight leading-tight mt-0.5">How are your pets today?</h1>
          </div>
          <NotificationBell unreadCount={unreadCount} />
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-2">
        {loadError ? (
          <div className="text-center py-20">
            <p className="text-sm text-muted-foreground mb-1">Unable to load your pets.</p>
            <p className="text-sm text-muted-foreground mb-4">Pull down to try again.</p>
            <button onClick={loadData} className="text-sm font-medium text-primary underline">Retry</button>
          </div>
        ) : pets.length === 0 ? (
          <div className="text-center py-20">
            <div className="h-20 w-20 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
              <PawPrint className="h-10 w-10 text-primary" />
            </div>
            <h2 className="font-serif text-2xl mb-2">Welcome to Wysker Watch</h2>
            <p className="text-muted-foreground mb-6 max-w-sm mx-auto">Let's add your first pet.</p>
            <Link to="/pets" className="inline-flex items-center gap-2 rounded-md bg-primary text-primary-foreground px-5 h-10 text-sm font-medium">
              Add Pet
            </Link>
          </div>
        ) : (
          <div className="space-y-6">
            {stale && (
              <p className="text-xs text-center text-muted-foreground">Some information may be out of date.</p>
            )}

            {activePets.length > 0 && (
              <div className="flex gap-3 overflow-x-auto -mx-4 px-4 pb-1">
                {activePets.map((pet) => (
                  <WellnessCard key={pet.id} pet={pet} wellness={wellness[pet.id]} />
                ))}
              </div>
            )}

            {activePets.length > 0 && (
              <div>
                <h2 className="text-[20px] font-bold text-white mb-3">Today's Check-Ins</h2>
                <div className="space-y-3">
                  {orderedCheckInPets.map((pet) => (
                    <div key={pet.id} className="space-y-2">
                      <CheckInCard
                        pet={pet}
                        checkIn={checkIns[pet.id]}
                        observations={observationSummaries[pet.id] || []}
                        onStartCheckIn={() => handleStartCheckIn(pet)}
                      />
                      {incompleteOnboardingIds.has(pet.id) && (
                        <CompleteProfileBanner petId={pet.id} petName={pet.name} />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {catchUpPet && (
              <CatchUpBanner petName={catchUpPet.name} onCatchUp={() => handleCatchUp(catchUpPet)} />
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
          onSaved={() => {
            const savedPet = checkInSheet.pet;
            setCheckInSheet(null);
            refreshPetCard(savedPet).catch((err) => {
              console.error(err);
              toast({ description: 'Saved, but unable to refresh this card. Pull down to refresh.' });
            });
          }}
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

// Only one Catch-Up reminder is ever shown on Home, for the most
// recently missed pet (Home Feature Spec #5) — tapping opens the same
// Daily Check-In flow, dated for yesterday, so the owner picks
// normal/changed/skipped from the existing sheet rather than a
// duplicate set of inline controls.
function CatchUpBanner({ petName, onCatchUp }) {
  return (
    <div className="text-center py-2">
      <p className="text-[13px] text-white/40 flex items-center justify-center gap-1.5">
        <CalendarClock className="h-3.5 w-3.5" aria-hidden="true" />
        Yesterday wasn't logged for {petName}.
      </p>
      <button onClick={onCatchUp} className="text-[13px] font-semibold text-primary mt-1">
        Catch up yesterday
      </button>
    </div>
  );
}
