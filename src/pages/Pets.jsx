import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Cat, Dog, Rainbow, Home as HomeIcon, Plus } from 'lucide-react';
import { entities } from '@/api/entities';
import { supabase } from '@/api/supabaseClient';
import { getRecentWellnessForPets } from '@/lib/checkin/checkinClient';
import { getPetLabel } from '@/lib/speciesConfig';
import { computeAge } from '@/lib/lifeStage';
import AddPetDialog from '../components/AddPetDialog';
import PageTransition from '../components/PageTransition';
import usePullToRefresh from '../hooks/usePullToRefresh';
import PullToRefreshIndicator from '../components/PullToRefreshIndicator';

const GLOW_COLOR = { good: '#4CC7B0', warn: '#F4C76B', bad: '#E57373', neutral: '#6FB7FF' };
const TREND_LABEL = { stable: 'Stable', improving: 'Improving', monitor: 'Monitor', declining: 'Declining', unknown: null };

function getStatusTone(score) {
  if (score == null) return 'neutral';
  if (score >= 90) return 'good';
  if (score >= 60) return 'warn';
  return 'bad';
}

export default function Pets() {
  const [pets, setPets] = useState([]);
  const [sharedPets, setSharedPets] = useState([]);
  const [wellness, setWellness] = useState({});
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    const { data: userData } = await supabase.auth.getUser();
    const me = userData?.user;
    const petList = await entities.Pet.list('-created_date');
    setPets(petList);

    const accesses = me?.email ? await entities.PetSitterAccess.filter({ sitter_email: me.email }) : [];
    if (accesses.length > 0) {
      const sitIds = [...new Set(accesses.map(a => a.pet_sit_id).filter(Boolean))];
      if (sitIds.length > 0) {
        const sits = await Promise.all(sitIds.map(id => entities.PetSit.get(id).catch(() => null)));
        const petIds = [...new Set(sits.filter(Boolean).flatMap(s => s.pet_ids || []))];
        const ownIds = new Set(petList.map(p => p.id));
        const toFetch = petIds.filter(id => !ownIds.has(id));
        if (toFetch.length > 0) {
          const shared = await Promise.all(toFetch.map(id => entities.Pet.get(id).catch(() => null)));
          setSharedPets(shared.filter(Boolean));
        } else {
          setSharedPets([]);
        }
      } else {
        setSharedPets([]);
      }
    } else {
      setSharedPets([]);
    }

    const activePets = petList.filter(p => !p.is_memorial);
    if (activePets.length) {
      const wellnessByPet = await getRecentWellnessForPets(activePets.map(p => p.id));
      setWellness(wellnessByPet);
    } else {
      setWellness({});
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);
  const { pullDistance, isRefreshing } = usePullToRefresh(loadData);

  if (loading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  const activePets = pets.filter(p => !p.is_memorial);
  const memorialPets = pets.filter(p => p.is_memorial);

  return (
    <PageTransition>
      <div className="min-h-screen pb-28">
        <PullToRefreshIndicator pullDistance={pullDistance} isRefreshing={isRefreshing} />
        <header style={{ paddingTop: 'env(safe-area-inset-top)' }}>
          <div className="max-w-2xl mx-auto px-5 py-6 flex items-start justify-between">
            <div>
              <p className="text-[20px] font-semibold tracking-widest uppercase text-primary/70 mb-0.5">Wysker Watch</p>
              <h1 className="text-[28px] font-bold text-foreground tracking-tight leading-tight">Pets</h1>
            </div>
            <button
              onClick={() => setShowAdd(true)}
              aria-label="Add a Pet"
              className="h-9 w-9 rounded-full bg-primary/15 flex items-center justify-center mt-1"
            >
              <Plus className="h-4 w-4 text-primary" />
            </button>
          </div>
        </header>

        <main className="max-w-2xl mx-auto px-4 py-5 space-y-6">
          {pets.length === 0 ? (
            <div className="text-center py-20">
              <div className="h-20 w-20 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                <Cat className="h-10 w-10 text-primary" />
              </div>
              <h2 className="font-serif text-2xl mb-2">Add your first pet</h2>
              <p className="text-muted-foreground mb-6 max-w-sm mx-auto">
                Set up a profile to start tracking daily health for your cat or dog.
              </p>
              <button
                onClick={() => setShowAdd(true)}
                className="inline-flex items-center gap-2 rounded-md bg-primary text-primary-foreground px-5 h-10 text-sm font-medium"
              >
                <Plus className="h-4 w-4" /> Add a Pet
              </button>
            </div>
          ) : (
            <>
              {activePets.length > 0 && (
                <div className="space-y-3">
                  {activePets.map(pet => (
                    <PetListRow key={pet.id} pet={pet} wellness={wellness[pet.id]} />
                  ))}
                </div>
              )}
              {memorialPets.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <Rainbow className="h-4 w-4 text-purple-700" />
                    <p className="text-sm font-semibold text-purple-700">Rainbow Bridge</p>
                  </div>
                  <div className="space-y-3">
                    {memorialPets.map(pet => (
                      <PetListRow key={pet.id} pet={pet} />
                    ))}
                  </div>
                </div>
              )}
              {sharedPets.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <HomeIcon className="h-4 w-4 text-muted-foreground" />
                    <p className="text-sm font-semibold text-muted-foreground">Shared with Me</p>
                  </div>
                  <div className="space-y-3">
                    {sharedPets.map(pet => (
                      <PetListRow key={pet.id} pet={pet} />
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </main>

        <AddPetDialog open={showAdd} onOpenChange={setShowAdd} onSuccess={loadData} returnTo="/pets" />
      </div>
    </PageTransition>
  );
}

function PetListRow({ pet, wellness }) {
  const isMemorial = pet.is_memorial;
  const score = wellness?.latest?.score ?? null;
  const trend = wellness?.trend;
  const tone = isMemorial ? 'neutral' : getStatusTone(score);
  const age = computeAge(pet);

  return (
    <Link
      to={`/pet/${pet.id}`}
      className="flex items-stretch rounded-2xl overflow-hidden border border-white/6 active:scale-[0.99] transition-transform"
      style={{ background: 'rgba(255,255,255,0.05)' }}
    >
      <div className="w-1 flex-shrink-0" style={{ background: GLOW_COLOR[tone], boxShadow: `0 0 12px ${GLOW_COLOR[tone]}80` }} />
      <div className="relative w-20 flex-shrink-0" style={{ minHeight: 92 }}>
        {pet.photo_url ? (
          <img src={pet.photo_url} alt={pet.name} className={`w-full h-full object-cover ${isMemorial ? 'grayscale opacity-50' : ''}`} style={{ minHeight: 92 }} />
        ) : (
          <div className="w-full h-full flex items-center justify-center" style={{ minHeight: 92, background: 'rgba(255,255,255,0.04)' }}>
            {pet.species === 'Dog' ? <Dog className="h-7 w-7 text-white/50" /> : <Cat className="h-7 w-7 text-white/50" />}
          </div>
        )}
        {isMemorial && (
          <div className="absolute top-2 right-2 bg-purple-500/70 text-white px-1.5 py-0.5 rounded-full backdrop-blur-sm"><Rainbow className="h-3 w-3" /></div>
        )}
      </div>
      <div className="flex-1 px-4 py-3 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-semibold text-white text-[18px] leading-snug truncate">{pet.name}</p>
            <p className="text-[12px] text-white/40 mt-0.5 truncate">
              {getPetLabel(pet.species)}{pet.breed ? ` · ${pet.breed}` : ''}{age ? ` · ${age}` : ''}
            </p>
          </div>
          {!isMemorial && (
            <div className="text-right flex-shrink-0">
              <p className="text-[20px] font-bold text-white leading-none">{score != null ? score : '—'}</p>
              {trend && TREND_LABEL[trend] && (
                <p className="text-[11px] font-medium mt-0.5" style={{ color: GLOW_COLOR[tone] }}>{TREND_LABEL[trend]}</p>
              )}
            </div>
          )}
        </div>
        {pet.conditions?.length > 0 && (
          <p className="text-[12px] text-white/40 mt-1.5 font-medium truncate">{pet.conditions.join(' | ')}</p>
        )}
      </div>
    </Link>
  );
}
