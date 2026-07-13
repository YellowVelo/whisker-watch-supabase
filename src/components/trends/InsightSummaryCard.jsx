import { useEffect, useState } from 'react';
import { Lightbulb } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { getInsightSummary, getObservationTrend, getWeightTrend } from '@/lib/checkin/trendsClient';

// Spec calls for distinct handling here vs. the other cards: on failure,
// hide the summary and show "Insights unavailable." rather than the
// shared "Unable to load trend." message, so it doesn't get its own
// MetricCardShell — the copy differs enough to warrant its own layout.
//
// Fetches its own inputs independently (rather than reading sibling
// cards' state) so a failure/slow fetch in one metric card can never
// block or couple to this one — per spec, "Other cards continue
// functioning" if any one card (including this one) fails.
export default function InsightSummaryCard({ petId, petName, range, timezone }) {
  const [state, setState] = useState({ loading: true, error: false, summary: null });

  useEffect(() => {
    let cancelled = false;
    setState({ loading: true, error: false, summary: null });
    (async () => {
      const [appetite, waterIntake, energy, weight] = await Promise.all([
        getObservationTrend(petId, 'appetite', range, timezone),
        getObservationTrend(petId, 'water_intake', range, timezone),
        getObservationTrend(petId, 'energy', range, timezone),
        getWeightTrend(petId, range, timezone),
      ]);
      return getInsightSummary(petId, petName, { appetite, waterIntake, energy, weight });
    })()
      .then((summary) => { if (!cancelled) setState({ loading: false, error: false, summary }); })
      .catch(() => { if (!cancelled) setState({ loading: false, error: true, summary: null }); });
    return () => { cancelled = true; };
  }, [petId, petName, range, timezone]);

  const { loading, error, summary } = state;

  return (
    <div className="rounded-2xl px-4 py-4" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
      <div className="flex items-center gap-2 mb-2">
        <Lightbulb className="h-4 w-4 text-white/40" aria-hidden="true" />
        <p className="text-[12px] font-semibold text-white/50 uppercase tracking-wide">Insight Summary</p>
      </div>

      {loading ? (
        <div className="space-y-2" aria-busy="true" aria-label="Loading insight summary">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </div>
      ) : error ? (
        <p className="text-[13px] text-white/40">Insights unavailable.</p>
      ) : !summary ? (
        <p className="text-[13px] text-white/40">Complete more check-ins to unlock AI insights.</p>
      ) : (
        <p className="text-base text-white/70 leading-relaxed">{summary}</p>
      )}
    </div>
  );
}
