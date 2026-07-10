import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Activity } from 'lucide-react';
import MetricCardShell from './MetricCardShell';
import TrendChart from './TrendChart';
import { DirectionIcon } from '@/components/AttributeTrendChip';
import { getWellnessScoreTrend } from '@/lib/checkin/trendsClient';
import { PALETTE } from '@/lib/toneColors';

// Health Score Revision V2 — this card is still the same Trends card slot
// (spec §22: "Preserve existing range controls" / "Do not change the
// Trends navigation architecture"), just reading the V2 0-10 score instead
// of the legacy 0-100 one. No Stable/Improving/Monitor/Declining wording
// remains — only a direction icon + the exact copy for each unknown case
// (spec §16).
const DIRECTION_REASON_COPY = {
  first_day: 'First day logged',
  missing_yesterday: 'Not enough data',
  no_checkin_today: 'Check in today',
};

export default function WellnessScoreCard({ petId, range, isMemorial, timezone }) {
  const [state, setState] = useState({ loading: true, error: false, data: null });

  useEffect(() => {
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: false }));
    getWellnessScoreTrend(petId, range, timezone)
      .then((data) => { if (!cancelled) setState({ loading: false, error: false, data }); })
      .catch(() => { if (!cancelled) setState({ loading: false, error: true, data: null }); });
    return () => { cancelled = true; };
  }, [petId, range, timezone]);

  const { loading, error, data } = state;
  const empty = !loading && !error && (!data || data.series.length === 0);
  const hasHistory = data?.hasAnyData;

  const comparisonText = data?.directionReason
    ? DIRECTION_REASON_COPY[data.directionReason] || 'Not enough data'
    : 'versus yesterday';

  return (
    <MetricCardShell
      icon={Activity}
      title="Health Score"
      periodLabel="Today"
      loading={loading}
      error={error}
      empty={empty}
      emptyMessage={hasHistory ? 'No data in this range.' : 'No health trends available yet.'}
      emptyAction={!hasHistory && !isMemorial ? (
        <Link to={`/pet/${petId}?startCheckin=1`} className="inline-block text-[13px] font-medium text-primary underline">
          Complete today's Daily Check-In
        </Link>
      ) : null}
    >
      {data && (
        <>
          <div className="flex items-baseline gap-1">
            <span className="text-[32px] font-bold text-white leading-none">{data.current ?? '—'}</span>
            <span className="text-[15px] text-white/40">/{data.max}</span>
          </div>
          <div className="mt-3">
            <TrendChart variant="line" series={data.series} range={range} yDomain={[0, 10]} color={PALETTE.amber} highlightExtremes />
          </div>
          <p className="text-[13px] text-white/40 mt-1.5 flex items-center gap-1.5">
            {!data.directionReason && <DirectionIcon direction={data.direction} />}
            {comparisonText}
          </p>
        </>
      )}
    </MetricCardShell>
  );
}
