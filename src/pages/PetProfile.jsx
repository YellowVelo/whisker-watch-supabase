import { useCallback, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import PetProfileContent from '../components/PetProfileContent';
import PageTransition from '../components/PageTransition';
import usePullToRefresh from '../hooks/usePullToRefresh';
import PullToRefreshIndicator from '../components/PullToRefreshIndicator';

// Thin route wrapper around PetProfileContent — the shared component that
// also renders inside each Pets-tab ExpandablePetProfileCard when expanded.
// This file only owns the page-level chrome (back button, pull-to-refresh)
// so the data loading and Wellness/Nav-card business logic lives in one
// place instead of two.
export default function PetProfile() {
  const { petId } = useParams();
  const navigate = useNavigate();
  const [reload, setReload] = useState(null);

  const doReload = useCallback(async () => { await reload?.(); }, [reload]);
  const { pullDistance, isRefreshing } = usePullToRefresh(doReload);

  return (
    <PageTransition>
      <div className="min-h-screen bg-background pb-28">
        <PullToRefreshIndicator pullDistance={pullDistance} isRefreshing={isRefreshing} />
        <header className="px-4 flex items-center" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 12px)' }}>
          <button onClick={() => navigate('/pets', { state: { expandPetId: petId } })} aria-label="Back to Pets" className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.06)' }}>
            <ArrowLeft className="h-5 w-5 text-white" />
          </button>
        </header>
        <div className="px-4 pt-2 max-w-2xl mx-auto">
          <PetProfileContent petId={petId} onReload={(fn) => setReload(() => fn)} />
        </div>
      </div>
    </PageTransition>
  );
}
