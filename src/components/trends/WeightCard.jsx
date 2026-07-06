import { useEffect, useState } from 'react';
import { Scale, ArrowDown, ArrowUp } from 'lucide-react';
import MetricCardShell from './MetricCardShell';
import TrendChart from './TrendChart';
import { getWeightTrend } from '@/lib/checkin/trendsClient';

const RANGE_PERIOD_LABEL = { '24H': 'Today', '7D': 'Last 7 Days', '30D': 'Last 30 Days', '90D': 'Last 90 Days', '1Y': 'Last Year' };

export default function WeightCard({ petId, range }) {
  const [state, setState] = useState({ loading: true, error: false, data: null });

  useEffect(() => {
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: false }));
    getWeightTrend(petId, range)
      .then((data) => { if (!cancelled) setState({ loading: false, error: false, data }); })
      .catch(() => { if (!cancelled) setState({ loading: false, error: true, data: null }); });
    return () => { cancelled = true; };
  }, [petId, range]);

  const { loading, error, data } = state;
  const empty = !loading && !error && (!data || data.series.length === 0);
  const hasHistory = data?.hasAnyData;

  return (
    <MetricCardShell
      icon={Scale}
      title="Weight"
      periodLabel={RANGE_PERIOD_LABEL[range]}
      loading={loading}
      error={error}
      empty={empty}
      emptyMessage={hasHistory ? 'No data in this range.' : 'No weight history available.'}
    >
      {data && (
        <>
          <div className="flex items-baseline gap-1">
            <span className="text-[28px] font-bold text-white leading-none">{data.currentLbs}</span>
            <span className="text-[14px] text-white/40">lbs</span>
          </div>
          {data.deltaLbs != null && (
            <p className="text-[13px] font-medium mt-0.5 flex items-center gap-1" style={{ color: data.deltaLbs === 0 ? '#A9AEB5' : '#F4C76B' }}>
              {data.deltaLbs < 0 ? <ArrowDown className="h-3.5 w-3.5" /> : data.deltaLbs > 0 ? <ArrowUp className="h-3.5 w-3.5" /> : null}
              {data.deltaLbs === 0 ? 'Steady' : `${data.deltaLbs < 0 ? 'Down' : 'Up'} ${Math.abs(data.deltaLbs)} lbs`}
            </p>
          )}
          <div className="mt-3">
            <TrendChart variant="line" series={data.series} range={range} color="#6FB7FF" />
          </div>
        </>
      )}
    </MetricCardShell>
  );
}
