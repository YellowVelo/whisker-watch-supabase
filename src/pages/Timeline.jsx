import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Clock, Pill, ShieldCheck, ClipboardList } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import PageTransition from '@/components/PageTransition';
import usePullToRefresh from '@/hooks/usePullToRefresh';
import PullToRefreshIndicator from '@/components/PullToRefreshIndicator';
import { getTimelineEvents, getTimelineCheckIns } from '@/lib/checkin/petProfileClient';
import { TONE_COLOR } from '@/lib/toneColors';

// The pet's complete chronological health history (Feature Spec: Timeline
// "contains all historical health events"), with check-in days rendered as
// their full set of per-attribute chips (vet visits need the granular
// answers, not a one-line "Daily check-in — Off Day" rollup) and
// medication/vaccination/weight events as compact rows alongside them.
const EVENT_ICON = { medication: Pill, vaccination: ShieldCheck, symptom_log: ClipboardList };

function ChipPill({ label, tone }) {
  const danger = tone === 'warn';
  return (
    <span
      className={`inline-flex items-center text-xs rounded-full px-2 py-0.5 ${danger ? 'border border-red-500/20' : 'border border-white/10'}`}
      style={{ background: danger ? 'rgba(239,68,68,0.1)' : 'rgba(255,255,255,0.06)', color: danger ? TONE_COLOR.warn : 'rgba(255,255,255,0.6)' }}
    >
      {label}
    </span>
  );
}

export default function Timeline() {
  const { petId } = useParams();
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [events, checkIns] = await Promise.all([
        getTimelineEvents(petId),
        getTimelineCheckIns(petId),
      ]);
      const otherEvents = events.filter((e) => e.type !== 'check_in');
      const checkInItems = checkIns.map((c) => ({
        id: `checkin-${c.id}`, date: c.date, kind: 'check_in',
        chips: c.chips.filter((chip) => chip.tone !== 'unknown').length > 0
          ? c.chips.filter((chip) => chip.tone !== 'unknown')
          : c.chips,
      }));
      const merged = [
        ...otherEvents.map((e) => ({ ...e, kind: 'event' })),
        ...checkInItems,
      ].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
      setItems(merged);
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

  const groups = {};
  for (const item of items) {
    const m = format(parseISO(item.date), 'MMMM yyyy');
    (groups[m] ||= []).push(item);
  }

  return (
    <PageTransition>
      <div className="min-h-screen bg-background pb-28">
        <PullToRefreshIndicator pullDistance={pullDistance} isRefreshing={isRefreshing} />
        <header
          className="sticky z-10 bg-background/90 backdrop-blur border-b border-border"
          style={{ top: 'var(--account-banner-height, 0px)', paddingTop: 'env(safe-area-inset-top)' }}
        >
          <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
            <button onClick={() => navigate(-1)} className="h-9 w-9 rounded-full bg-secondary flex items-center justify-center">
              <ArrowLeft className="h-5 w-5" />
            </button>
            <h1 className="font-serif text-[28px]">Timeline</h1>
          </div>
        </header>

        <div className="max-w-2xl mx-auto px-4 py-6">
          {loadError ? (
            <div className="text-center py-20">
              <p className="text-base text-muted-foreground mb-4">Unable to load timeline.</p>
              <button onClick={loadData} className="text-sm font-medium text-primary underline">Retry</button>
            </div>
          ) : loading ? (
            <div className="space-y-3" aria-busy="true" aria-label="Loading timeline">
              {[0, 1, 2, 3, 4].map((i) => (
                <div key={i} className="h-16 rounded-2xl animate-pulse" style={{ background: 'rgba(255,255,255,0.05)' }} />
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className="text-center py-20">
              <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                <Clock className="h-8 w-8 text-primary" />
              </div>
              <h2 className="font-serif text-2xl mb-2">No events yet</h2>
              <p className="text-base text-muted-foreground max-w-sm mx-auto">
                Events will appear as your pet's health history grows.
              </p>
            </div>
          ) : (
            Object.entries(groups).map(([month, monthItems]) => (
              <div key={month} className="mb-6">
                <p className="text-xs font-bold uppercase tracking-widest text-white/30 mb-3 px-1">{month}</p>
                <div className="space-y-2">
                  {monthItems.map((item) => {
                    const d = format(parseISO(item.date), 'MMM d');
                    const weekday = format(parseISO(item.date), 'EEE');
                    if (item.kind === 'check_in') {
                      return (
                        <div key={item.id} className="rounded-2xl p-4" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
                          <div className="flex items-baseline gap-2 mb-3">
                            <p className="text-sm font-bold text-white">{d}</p>
                            <p className="text-xs text-white/30">{weekday}</p>
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {item.chips.map((chip) => (
                              <ChipPill key={chip.code} label={chip.tone === 'warn' ? `${chip.categoryLabel}: ${chip.label}` : chip.label} tone={chip.tone} />
                            ))}
                          </div>
                        </div>
                      );
                    }
                    const Icon = EVENT_ICON[item.type] || Clock;
                    return (
                      <div key={item.id} className="flex items-center gap-3 rounded-2xl px-4 py-3" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
                        <div className="h-9 w-9 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(255,255,255,0.08)' }}>
                          <Icon className="h-4 w-4 text-white/60" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-white truncate">{item.title}</p>
                          <p className="text-sm text-white/40">{d}, {format(parseISO(item.date), 'yyyy')}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </PageTransition>
  );
}
