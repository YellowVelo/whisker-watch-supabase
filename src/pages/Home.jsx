import { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import CatCard from '../components/CatCard';
import AddCatDialog from '../components/AddCatDialog';
import PageTransition from '../components/PageTransition';
import usePullToRefresh from '../hooks/usePullToRefresh';
import PullToRefreshIndicator from '../components/PullToRefreshIndicator';

export default function Home() {
  const [cats, setCats] = useState([]);
  const [sharedCats, setSharedCats] = useState([]);
  const [latestLogs, setLatestLogs] = useState({});
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    const me = await base44.auth.me();
    const catList = await base44.entities.Cat.list('-created_date');
    setCats(catList);

    // Load pets shared with me as a sitter (via pet sit records)
    const accesses = await base44.entities.PetSitterAccess.filter({ sitter_email: me.email });
    if (accesses.length > 0) {
      const sitIds = [...new Set(accesses.map(a => a.pet_sit_id).filter(Boolean))];
      if (sitIds.length > 0) {
        const sits = await Promise.all(sitIds.map(id => base44.entities.PetSit.get(id)));
        const catIds = [...new Set(sits.flatMap(s => s?.cat_ids || []))];
        const ownIds = new Set(catList.map(c => c.id));
        const toFetch = catIds.filter(id => !ownIds.has(id));
        if (toFetch.length > 0) {
          const shared = await Promise.all(toFetch.map(id => base44.entities.Cat.get(id)));
          setSharedCats(shared.filter(Boolean));
        } else {
          setSharedCats([]);
        }
      } else {
        setSharedCats([]);
      }
    } else {
      setSharedCats([]);
    }
    if (catList.length) {
      const logs = await base44.entities.SymptomLog.list('-date', 200);
      const latest = {};
      for (const log of logs) {
        if (!latest[log.cat_id] || log.date > latest[log.cat_id].date) {
          latest[log.cat_id] = log;
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
      <header className="relative overflow-hidden" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="absolute inset-0 bg-gradient-to-br from-primary/20 via-accent/10 to-secondary" />
        <div className="absolute inset-0" style={{ backgroundImage: "url('https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?w=800&q=60')", backgroundSize: 'cover', backgroundPosition: 'center', opacity: 0.08 }} />
        <div className="relative max-w-2xl mx-auto px-5 py-6">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-2xl">🐾</span>
                <h1 className="font-serif text-3xl tracking-tight">Whisker Watch</h1>
              </div>
              <p className="text-sm text-muted-foreground">Your pets' health, all in one place</p>
            </div>
            <Button onClick={() => setShowAdd(true)} className="shadow-md rounded-2xl h-11 px-4">
              <Plus className="h-4 w-4 mr-1" /> Add Pet
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-5">
        {cats.length === 0 ? (
          <div className="text-center py-20">
            <div className="h-20 w-20 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
              <span className="text-5xl">🐾</span>
            </div>
            <h2 className="font-serif text-2xl mb-2">Welcome to Whisker Watch</h2>
            <p className="text-muted-foreground mb-6 max-w-sm mx-auto">
              Track daily symptoms for your cats and dogs with chronic conditions. Spot patterns and share insights with your vet.
            </p>
            <Button onClick={() => setShowAdd(true)}>
              <Plus className="h-4 w-4 mr-1" /> Add Your First Pet
            </Button>
          </div>
        ) : (
          <div className="space-y-6">
            {cats.filter(c => !c.is_memorial).length > 0 && (
              <div className="grid grid-cols-2 gap-4">
                {cats.filter(c => !c.is_memorial).map(cat => (
                  <CatCard key={cat.id} cat={cat} latestLog={latestLogs[cat.id]} />
                ))}
              </div>
            )}
            {cats.filter(c => c.is_memorial).length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-lg">🌈</span>
                  <p className="text-sm font-semibold text-purple-700">Rainbow Bridge</p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  {cats.filter(c => c.is_memorial).map(cat => (
                    <CatCard key={cat.id} cat={cat} latestLog={latestLogs[cat.id]} />
                  ))}
                </div>
              </div>
            )}
            {sharedCats.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-lg">🏠</span>
                  <p className="text-sm font-semibold text-muted-foreground">Shared with Me</p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  {sharedCats.map(cat => (
                    <CatCard key={cat.id} cat={cat} latestLog={latestLogs[cat.id]} />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      <AddCatDialog open={showAdd} onOpenChange={setShowAdd} onSuccess={loadData} />
    </div>
    </PageTransition>
  );
}