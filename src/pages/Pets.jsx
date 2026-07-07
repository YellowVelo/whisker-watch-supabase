import { useState, useEffect, useCallback, useRef } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { PawPrint, Plus, Activity, Rainbow, Home as HomeIcon, Cat, Dog } from 'lucide-react';
import { entities } from '@/api/entities';
import { getSharedPetsForUser } from '@/lib/petsClient';
import ExpandablePetProfileCard from '../components/ExpandablePetProfileCard';
import AddPetDialog from '../components/AddPetDialog';
import PageTransition from '../components/PageTransition';
import usePullToRefresh from '../hooks/usePullToRefresh';
import PullToRefreshIndicator from '../components/PullToRefreshIndicator';

export default function Pets() {
  const [pets, setPets] = useState([]);
  const [sharedPets, setSharedPets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [highlightedPetId, setHighlightedPetId] = useState(null);
  const cardRefs = useRef({});
  const highlightTimeoutRef = useRef(null);
  const location = useLocation();
  const navigate = useNavigate();
  // Cards start collapsed unless opened via a deep link/route state (e.g.
  // returning from a pet's full profile page, or right after adding a pet).
  const [expandedPetId, setExpandedPetId] = useState(location.state?.expandPetId || null);

  useEffect(() => () => clearTimeout(highlightTimeoutRef.current), []);

  useEffect(() => {
    if (!location.state?.expandPetId) return;
    setExpandedPetId(location.state.expandPetId);
    navigate('.', { replace: true, state: {} });
  }, [location.state, navigate]);

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

    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);
  const { pullDistance, isRefreshing } = usePullToRefresh(loadData);

  const handleAddSuccess = useCallback((newPetId) => {
    loadData().then(() => {
      if (!newPetId) return;
      setHighlightedPetId(newPetId);
      setExpandedPetId(newPetId);
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
              <p className="text-base text-muted-foreground mb-1">Unable to load pets.</p>
              <p className="text-base text-muted-foreground mb-4">Please check your connection and try again.</p>
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
                      <ExpandablePetProfileCard
                        key={pet.id}
                        pet={pet}
                        highlighted={highlightedPetId === pet.id}
                        defaultExpanded={expandedPetId === pet.id}
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
                      <ExpandablePetProfileCard
                        key={pet.id}
                        pet={pet}
                        defaultExpanded={expandedPetId === pet.id}
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
      <p className="text-base font-semibold text-white truncate">{pet.name}</p>
    </Link>
  );
}

function PetsSkeleton() {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Loading pets">
      {[0, 1, 2].map((i) => (
        <div key={i} className="rounded-2xl px-4 py-6 flex flex-col items-center" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
          <div className="rounded-full flex-shrink-0 animate-pulse" style={{ width: 96, height: 96, background: 'rgba(255,255,255,0.08)' }} />
          <div className="h-5 w-32 rounded-full animate-pulse mt-3" style={{ background: 'rgba(255,255,255,0.08)' }} />
          <div className="h-3 w-40 rounded-full animate-pulse mt-2" style={{ background: 'rgba(255,255,255,0.06)' }} />
          <div className="flex gap-2 mt-4 w-full justify-center">
            {[0, 1, 2, 3, 4].map((j) => (
              <div key={j} className="rounded-full flex-shrink-0 animate-pulse" style={{ width: 56, height: 56, background: 'rgba(255,255,255,0.06)' }} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
