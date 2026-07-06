import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Clock, CheckCircle2, Pill, ShieldCheck, ClipboardList } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import PageTransition from '@/components/PageTransition';
import usePullToRefresh from '@/hooks/usePullToRefresh';
import PullToRefreshIndicator from '@/components/PullToRefreshIndicator';
import { getTimelineEvents } from '@/lib/checkin/petProfileClient';

// The pet's complete chronological health history (Feature Spec: Timeline
// "contains all historical health events"). Pet Profile's Timeline card
// shows a count derived from getTimelineEvents — this page renders that
// exact same list, so the number a caller sees always matches what's here.
const EVENT_ICON = { check_in: CheckCircle2, medication: Pill, vaccination: ShieldCheck, symptom_log: ClipboardList };

export default function Timeline() {
  const { petId } = useParams();
  const navigate = useNavigate();
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const loadData = useCallback(async () => {
    try {
      setEvents(await getTimelineEvents(petId));
      setLoadError(false);
    } catch (err) {
      console.error(err);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [petId]);

  useEffect(() => { loadData(); }, [loadData]);
  const { pullDistance, isRefreshing } = usePullToRefresh(loadData);

  return (
    <PageTransition>
      <div className="min-h-screen bg-background pb-28">
        <PullToRefreshIndicator pullDistance={pullDistance} isRefreshing={isRefreshing} />
        <header
          className="sticky top-0 z-10 bg-background/90 backdrop-blur border-b border-border"
          style={{ paddingTop: 'env(safe-area-inset-top)' }}
        >
          <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
            <button onClick={() => navigate(-1)} className="h-9 w-9 rounded-full bg-secondary flex items-center justify-center">
              <ArrowLeft className="h-5 w-5" />
            </button>
            <h1 className="font-serif text-2xl">Timeline</h1>
          </div>
        </header>

        <div className="max-w-2xl mx-auto px-4 py-6">
          {loadError ? (
            <div className="text-center py-20">
              <p className="text-sm text-muted-foreground mb-4">Unable to load timeline.</p>
              <button onClick={loadData} className="text-sm font-medium text-primary underline">Retry</button>
            </div>
          ) : loading ? (
            <div className="space-y-3" aria-busy="true" aria-label="Loading timeline">
              {[0, 1, 2, 3, 4].map((i) => (
                <div key={i} className="h-16 rounded-2xl animate-pulse" style={{ background: 'rgba(255,255,255,0.05)' }} />
              ))}
            </div>
          ) : events.length === 0 ? (
            <div className="text-center py-20">
              <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                <Clock className="h-8 w-8 text-primary" />
              </div>
              <h2 className="font-serif text-2xl mb-2">No events yet</h2>
              <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                Events will appear as your pet's health history grows.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {events.map((event) => {
                const Icon = EVENT_ICON[event.type] || Clock;
                return (
                  <div key={event.id} className="flex items-center gap-3 rounded-2xl px-4 py-3" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
                    <div className="h-9 w-9 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(255,255,255,0.08)' }}>
                      <Icon className="h-4 w-4 text-white/60" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-white truncate">{event.title}</p>
                      <p className="text-xs text-white/40">{format(parseISO(event.date), 'MMM d, yyyy')}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </PageTransition>
  );
}
