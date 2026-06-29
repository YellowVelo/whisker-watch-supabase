import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { PawPrint, Rainbow, Home as HomeIcon, Settings } from 'lucide-react';
import { entities } from '@/api/entities';
import { supabase } from '@/api/supabaseClient';
import PetCard from '../components/PetCard';
import PageTransition from '../components/PageTransition';
import usePullToRefresh from '../hooks/usePullToRefresh';
import PullToRefreshIndicator from '../components/PullToRefreshIndicator';

export default function Home() {
  const [pets, setPets] = useState([]);
  const [sharedPets, setSharedPets] = useState([]);
  const [latestLogs, setLatestLogs] = useState({});
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    setLoading(true);
    const { data: userData } = await supabase.auth.getUser();
    const me = userData?.user;
    const petList = await entities.Pet.list('-created_date');
    setPets(petList);

    // Load pets shared with me as a sitter (via pet sit records)
    const accesses = await entities.PetSitterAccess.filter({ sitter_email: me.email });
    if (accesses.length > 0) {
      const sitIds = [...new Set(accesses.map(a => a.pet_sit_id).filter(Boolean))];
      if (sitIds.length > 0) {
        const sits = await Promise.all(sitIds.map(id => entities.PetSit.get(id)));
        const petIds = [...new Set(sits.flatMap(s => s?.pet_ids || []))];
        const ownIds = new Set(petList.map(p => p.id));
        const toFetch = petIds.filter(id => !ownIds.has(id));
        if (toFetch.length > 0) {
          const shared = await Promise.all(toFetch.map(id => entities.Pet.get(id)));
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
    if (petList.length) {
      const logs = await entities.SymptomLog.list('-date', 200);
      const latest = {};
      for (const log of logs) {
        if (!latest[log.pet_id] || log.date > latest[log.pet_id].date) {
          latest[log.pet_id] = log;
        }
      }
      setLatestLogs(latest);
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const { isPulling, pullDistance, isRefreshing } = usePullToRefresh(loadData);

  if (loading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <PageTransition>
    <div className="min-h-screen pb-28">
      <PullToRefreshIndicator pullDistance={pullDistance} isRefreshing={isRefreshing} />
      <header style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="max-w-2xl mx-auto px-5 py-6 flex items-start justify-between">
          <div>
            <p className="text-[20px] font-semibold tracking-widest uppercase text-primary/70 mb-0.5">Whisker Watch</p>
            <h1 className="text-[28px] font-bold text-foreground tracking-tight leading-tight">My Pets</h1>
          </div>
          <Link to="/settings" className="h-9 w-9 rounded-full bg-secondary flex items-center justify-center mt-1">
            <Settings className="h-4 w-4 text-foreground" />
          </Link>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-5">
        {pets.length === 0 ? (
          <div className="text-center py-20">
            <div className="h-20 w-20 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
              <PawPrint className="h-10 w-10 text-primary" />
            </div>
            <h2 className="font-serif text-2xl mb-2">Welcome to Whisker Watch</h2>
            <p className="text-muted-foreground mb-6 max-w-sm mx-auto">
              Track daily symptoms for your cats and dogs with chronic conditions. Spot patterns and share insights with your vet.
            </p>
            <Link to="/settings" className="inline-flex items-center gap-2 rounded-md bg-primary text-primary-foreground px-5 h-10 text-sm font-medium">
              Add a Pet in Settings
            </Link>
          </div>
        ) : (
          <div className="space-y-6">
            {pets.filter(p => !p.is_memorial).length > 0 && (
              <div className="space-y-3">
                {pets.filter(p => !p.is_memorial).map(pet => (
                  <PetCard key={pet.id} pet={pet} latestLog={latestLogs[pet.id]} />
                ))}
              </div>
            )}
            {pets.filter(p => p.is_memorial).length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Rainbow className="h-4 w-4 text-purple-700" />
                  <p className="text-sm font-semibold text-purple-700">Rainbow Bridge</p>
                </div>
                <div className="space-y-3">
                  {pets.filter(p => p.is_memorial).map(pet => (
                    <PetCard key={pet.id} pet={pet} latestLog={latestLogs[pet.id]} />
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
                    <PetCard key={pet.id} pet={pet} latestLog={latestLogs[pet.id]} />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
    </PageTransition>
  );
}
