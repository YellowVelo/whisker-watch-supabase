import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, ChevronRight, Cat, Dog } from 'lucide-react';
import { entities } from '@/api/entities';
import { getSharedPetsForUser } from '@/lib/petsClient';
import PageTransition from '../components/PageTransition';

// Directory of the user's pets, linking to each pet's AI tab
// (`/pet/:petId/profile?tab=ai`) so AI insights/chat are reachable from
// the main Menu without first opening a specific pet. Includes
// sitter-shared pets so a sitter can also ask AI questions about a pet
// they're watching.
export default function AIMenu() {
  const navigate = useNavigate();
  const [pets, setPets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    (async () => {
      const owned = await entities.Pet.list('-created_date');
      const shared = await getSharedPetsForUser(owned).catch(() => []);
      setPets([...owned, ...shared.map((p) => ({ ...p, _shared: true }))]);
    })()
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  return (
    <PageTransition>
      <div className="min-h-screen pb-28">
        <header className="px-4 flex items-center gap-3" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 12px)' }}>
          <button onClick={() => navigate(-1)} aria-label="Back" className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.06)' }}>
            <ArrowLeft className="h-5 w-5 text-white" />
          </button>
          <h1 className="text-[22px] font-bold text-foreground">AI</h1>
        </header>

        <main className="max-w-2xl mx-auto px-4 pt-4 space-y-3">
          {loading ? (
            <div className="space-y-3">
              {[0, 1].map((i) => (
                <div key={i} className="h-16 rounded-2xl animate-pulse" style={{ background: 'rgba(255,255,255,0.05)' }} />
              ))}
            </div>
          ) : error ? (
            <p className="text-sm text-white/40 text-center py-8">Unable to load your pets.</p>
          ) : pets.length === 0 ? (
            <p className="text-sm text-white/40 text-center py-8">No pets yet.</p>
          ) : (
            pets.map((pet) => (
              <Link
                key={pet.id}
                to={`/pet/${pet.id}/profile?tab=ai`}
                className="flex items-center gap-3 rounded-2xl px-4 py-3 active:opacity-80 transition-opacity"
                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}
              >
                <div className="h-12 w-12 rounded-full overflow-hidden flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(255,255,255,0.06)' }}>
                  {pet.photo_url ? (
                    <img src={pet.photo_url} alt="" className="w-full h-full object-cover" />
                  ) : pet.species === 'Dog' ? (
                    <Dog className="h-5 w-5 text-white/40" />
                  ) : (
                    <Cat className="h-5 w-5 text-white/40" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[15px] font-semibold text-white truncate">{pet.name}</p>
                  <p className="text-[13px] text-white/40 truncate">{pet.breed || pet.species}{pet._shared ? ' · Shared with you' : ''}</p>
                </div>
                <ChevronRight className="h-4 w-4 text-white/25 flex-shrink-0" />
              </Link>
            ))
          )}
        </main>
      </div>
    </PageTransition>
  );
}
