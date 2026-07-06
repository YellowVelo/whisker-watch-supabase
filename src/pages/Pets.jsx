import { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { PawPrint, Plus, Activity, Rainbow, Home as HomeIcon, Cat, Dog } from 'lucide-react';
import { entities } from '@/api/entities';
import { getCheckInsForPets, getRecentWellnessForPets, getObservationValuesForCheckIns } from '@/lib/checkin/checkinClient';
import { getActiveMedicationCountsForPets, getSharedPetsForUser } from '@/lib/petsClient';
import PetCard from '../components/PetCard';
import AddPetDialog from '../components/AddPetDialog';
import PageTransition from '../components/PageTransition';
import usePullToRefresh from '../hooks/usePullToRefresh';
import PullToRefreshIndicator from '../components/PullToRefreshIndicator';

const todayStr = () => new Date().toISOString().split('T')[0];

export default function Pets() {
  const [pets, setPets] = useState([]);
  const [sharedPets, setSharedPets] = useState([]);
  const [wellness, setWellness] = useState({});
  const [checkIns, setCheckIns] = useState({});
  const [observationValues, setObservationValues] = useState({});
  const [medicationCounts, setMedicationCounts] = useState({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  // Wellness score and today's-logs each have their own spec'd degraded
  // state ("Unable to load wellness score" / "Unable to load today's
  // logs") distinct from a hard pets-list failure — a hiccup in either
  // must not take down the whole list, and the pet must stay selectable.
  const [logsUnavailable, setLogsUnavailable] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [highlightedPetId, setHighlightedPetId] = useState(null);
  const cardRefs = useRef({});
  const highlightTimeoutRef = useRef(null);

  useEffect(() => () => clearTimeout(highlightTimeoutRef.current), []);

  const loadData = useCallback(async () => {
    let petList;
    try {
      petList = await entities.Pet.list('-created_date');
      setPets(petList);
      setLoadError(false);
    } catch (err) {
      console.error(err);
      setLoadError(true);
      setLoading(false);
      return;
    }

    // Non-critical: pet-sitting access. A failure here shouldn't hide the
    // owner's own pets, so it's isolated from the pets-list try/catch above.
    try {
      setSharedPets(await getSharedPetsForUser(petList));
    } catch (err) {
      console.error(err);
      setSharedPets([]);
    }

    const activePets = petList.filter((p) => !p.is_memorial);
    const petIds = activePets.map((p) => p.id);

    if (petIds.length) {
      const [wellnessResult, checkInsResult, medCountsResult] = await Promise.allSettled([
        getRecentWellnessForPets(petIds),
        getCheckInsForPets(petIds, todayStr()),
        getActiveMedicationCountsForPets(petIds),
      ]);

      // Wellness failure: PetCard already renders "--" and hides the trend
      // whenever there's no score for this pet, so clearing to {} on
      // failure reuses that same empty-state rendering without a separate
      // error flag — the pet stays fully selectable either way.
      if (wellnessResult.status === 'fulfilled') {
        setWellness(wellnessResult.value);
      } else {
        console.error(wellnessResult.reason);
        setWellness({});
      }

      if (medCountsResult.status === 'fulfilled') {
        setMedicationCounts(medCountsResult.value);
      } else {
        console.error(medCountsResult.reason);
        setMedicationCounts({});
      }

      if (checkInsResult.status === 'fulfilled') {
        const todayRows = checkInsResult.value;
        setCheckIns(todayRows);
        try {
          setObservationValues(await getObservationValuesForCheckIns(todayRows));
          setLogsUnavailable(false);
        } catch (err) {
          console.error(err);
          setObservationValues({});
          setLogsUnavailable(true);
        }
      } else {
        console.error(checkInsResult.reason);
        setCheckIns({});
        setObservationValues({});
        setLogsUnavailable(true);
      }
    } else {
      setWellness({});
      setCheckIns({});
      setMedicationCounts({});
      setObservationValues({});
      setLogsUnavailable(false);
    }

    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);
  const { pullDistance, isRefreshing } = usePullToRefresh(loadData);

  const handleAddSuccess = useCallback((newPetId) => {
    loadData().then(() => {
      if (!newPetId) return;
      setHighlightedPetId(newPetId);
      requestAnimationFrame(() => {
        cardRefs.current[newPetId]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
      clearTimeout(highlightTimeoutRef.current);
      highlightTimeoutRef.current = setTimeout(() => setHighlightedPetId((id) => (id === newPetId ? null : id)), 4000);
    });
  }, [loadData]);

  const activePets = pets.filter((p) => !p.is_memorial);
  const memorialPets = pets.filter((p) => p.is_memorial);

  return (
    <PageTransition>
      <div className="min-h-screen pb-28">
        <PullToRefreshIndicator pullDistance={pullDistance} isRefreshing={isRefreshing} />

        <header style={{ paddingTop: 'env(safe-area-inset-top)' }}>
          <div className="max-w-2xl mx-auto px-5 py-6 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <PawPrint className="h-6 w-6 text-primary flex-shrink-0" aria-hidden="true" />
                <h1 className="text-[28px] font-bold text-foreground tracking-tight leading-tight">My Pets</h1>
              </div>
              <p className="text-[14px] text-white/45 mt-1">All the pets in your care, in one place.</p>
            </div>
            <button
              onClick={() => setShowAdd(true)}
              className="flex items-center gap-1.5 rounded-full bg-primary text-primary-foreground px-4 h-10 text-sm font-semibold flex-shrink-0 active:opacity-80 transition-opacity"
            >
              <Plus className="h-4 w-4" /> Add Pet
            </button>
          </div>
        </header>

        <main className="max-w-2xl mx-auto px-4 space-y-6">
          {loadError ? (
            <div className="text-center py-20">
              <p className="text-sm text-muted-foreground mb-1">Unable to load pets.</p>
              <p className="text-sm text-muted-foreground mb-4">Please check your connection and try again.</p>
              <button onClick={loadData} className="text-sm font-medium text-primary underline">Retry</button>
            </div>
          ) : loading ? (
            <PetsSkeleton />
          ) : pets.length === 0 && sharedPets.length === 0 ? (
            <div className="text-center py-20">
              <div className="h-20 w-20 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                <PawPrint className="h-10 w-10 text-primary" />
              </div>
              <h2 className="font-serif text-2xl mb-2">No pets yet</h2>
              <p className="text-muted-foreground mb-6 max-w-sm mx-auto">
                Add your first pet to begin tracking their health.
              </p>
              <button
                onClick={() => setShowAdd(true)}
                className="inline-flex items-center gap-2 rounded-md bg-primary text-primary-foreground px-5 h-10 text-sm font-medium"
              >
                <Plus className="h-4 w-4" /> Add Pet
              </button>
            </div>
          ) : (
            <>
              {activePets.length > 0 && (
                <section>
                  <div className="flex items-center gap-2 mb-0.5">
                    <Activity className="h-4 w-4 text-primary flex-shrink-0" aria-hidden="true" />
                    <h2 className="text-[13px] font-bold tracking-widest uppercase text-primary">Active Pets</h2>
                  </div>
                  <p className="text-[13px] text-white/40 mb-3">Pets you monitor every day</p>
                  <div className="space-y-3">
                    {activePets.map((pet) => (
                      <PetCard
                        key={pet.id}
                        pet={pet}
                        wellness={wellness[pet.id]}
                        checkIn={checkIns[pet.id]}
                        observationValues={observationValues[pet.id]}
                        logsUnavailable={logsUnavailable}
                        medicationCount={medicationCounts[pet.id] || 0}
                        highlighted={highlightedPetId === pet.id}
                        cardRef={(el) => { cardRefs.current[pet.id] = el; }}
                      />
                    ))}
                  </div>
                </section>
              )}

              {sharedPets.length > 0 && (
                <section>
                  <div className="flex items-center gap-2 mb-3">
                    <HomeIcon className="h-4 w-4 text-muted-foreground flex-shrink-0" aria-hidden="true" />
                    <h2 className="text-[13px] font-bold tracking-widest uppercase text-muted-foreground">Shared with Me</h2>
                  </div>
                  <div className="space-y-3">
                    {sharedPets.map((pet) => (
                      <SharedPetRow key={pet.id} pet={pet} />
                    ))}
                  </div>
                </section>
              )}

              {memorialPets.length > 0 && (
                <section>
                  <div className="flex items-center gap-2 mb-0.5">
                    <Rainbow className="h-4 w-4 text-purple-400 flex-shrink-0" aria-hidden="true" />
                    <h2 className="text-[13px] font-bold tracking-widest uppercase text-purple-400">Rainbow Bridge</h2>
                  </div>
                  <p className="text-[13px] text-white/40 mb-3">Pets who will always be with us</p>
                  <div className="space-y-3">
                    {memorialPets.map((pet) => (
                      <PetCard
                        key={pet.id}
                        pet={pet}
                        cardRef={(el) => { cardRefs.current[pet.id] = el; }}
                      />
                    ))}
                  </div>
                </section>
              )}
            </>
          )}
        </main>

        <AddPetDialog open={showAdd} onOpenChange={setShowAdd} onSuccess={handleAddSuccess} returnTo="/pets" />
      </div>
    </PageTransition>
  );
}

// Pets the signed-in user has sitter access to (via PetSit/PetSitterAccess)
// but does not own — not part of the Pets Feature Spec mockup, kept as a
// lightweight row so existing pet-sitting access isn't lost from the screen.
function SharedPetRow({ pet }) {
  return (
    <Link
      to={`/pet/${pet.id}/trends`}
      className="flex items-center gap-3 rounded-2xl px-4 py-3 active:opacity-80 transition-opacity"
      style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}
    >
      <div className="h-11 w-11 rounded-full overflow-hidden flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(255,255,255,0.06)' }}>
        {pet.photo_url ? (
          <img src={pet.photo_url} alt="" className="w-full h-full object-cover" />
        ) : pet.species === 'Dog' ? (
          <Dog className="h-5 w-5 text-white/40" />
        ) : (
          <Cat className="h-5 w-5 text-white/40" />
        )}
      </div>
      <p className="text-[15px] font-semibold text-white truncate">{pet.name}</p>
    </Link>
  );
}

function PetsSkeleton() {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Loading pets">
      {[0, 1, 2].map((i) => (
        <div key={i} className="rounded-2xl px-4 py-4" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
          <div className="flex items-start gap-3.5">
            <div className="rounded-full flex-shrink-0 animate-pulse" style={{ width: 72, height: 72, background: 'rgba(255,255,255,0.08)' }} />
            <div className="flex-1 min-w-0 space-y-2 pt-1">
              <div className="h-4 w-28 rounded-full animate-pulse" style={{ background: 'rgba(255,255,255,0.08)' }} />
              <div className="h-3 w-40 rounded-full animate-pulse" style={{ background: 'rgba(255,255,255,0.06)' }} />
              <div className="h-5 w-24 rounded-full animate-pulse" style={{ background: 'rgba(255,255,255,0.06)' }} />
            </div>
            <div className="h-14 w-14 rounded-full flex-shrink-0 animate-pulse" style={{ background: 'rgba(255,255,255,0.08)' }} />
          </div>
          <div className="mt-3.5 pt-3 grid grid-cols-3 gap-2" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
            {[0, 1, 2, 3, 4, 5].map((j) => (
              <div key={j} className="h-9 rounded-xl animate-pulse" style={{ background: 'rgba(255,255,255,0.04)' }} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
