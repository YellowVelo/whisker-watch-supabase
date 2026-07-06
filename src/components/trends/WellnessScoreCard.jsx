import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Activity, ArrowDown, ArrowUp } from 'lucide-react';
import MetricCardShell from './MetricCardShell';
import TrendChart from './TrendChart';
import { getWellnessScoreTrend } from '@/lib/checkin/trendsClient';

export default function WellnessScoreCard({ petId, range, isMemorial }) {
  const [state, setState] = useState({ loading: true, error: false, data: null });

  useEffect(() => {
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: false }));
    getWellnessScoreTrend(petId, range)
      .then((data) => { if (!cancelled) setState({ loading: false, error: false, data }); })
      .catch(() => { if (!cancelled) setState({ loading: false, error: true, data: null }); });
    return () => { cancelled = true; };
  }, [petId, range]);

  const { loading, error, data } = state;
  const empty = !loading && !error && (!data || data.series.length === 0);
  const hasHistory = data?.hasAnyData;

  return (
    <MetricCardShell
      icon={Activity}
      title="Wellness Score"
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
          <p className="text-[13px] font-medium mt-0.5" style={{ color: data.statusLabel ? '#F4C76B' : 'rgba(255,255,255,0.4)' }}>
            {data.statusLabel || 'Not checked in today'}
          </p>
          <div className="mt-3">
            <TrendChart variant="line" series={data.series} range={range} yDomain={[0, 100]} color="#F4C76B" highlightExtremes />
          </div>
          {data.deltaFromYesterday != null && (
            <p className="text-[12px] text-white/40 mt-1 flex items-center gap-1">
              {data.deltaFromYesterday < 0 ? <ArrowDown className="h-3 w-3" /> : data.deltaFromYesterday > 0 ? <ArrowUp className="h-3 w-3" /> : null}
              {data.deltaFromYesterday === 0
                ? 'No change from yesterday'
                : `${data.deltaFromYesterday < 0 ? 'Down' : 'Up'} ${Math.abs(data.deltaFromYesterday)} pts from yesterday`}
            </p>
          )}
        </>
      )}
    </MetricCardShell>
  );
}
