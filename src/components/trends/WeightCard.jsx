import { useEffect, useState } from 'react';
import { Scale, ArrowDown, ArrowUp, Plus } from 'lucide-react';
import MetricCardShell from './MetricCardShell';
import TrendChart from './TrendChart';
import WeightLogSheet from '../WeightLogSheet';
import { Button } from '@/components/ui/button';
import { getWeightTrend } from '@/lib/weightClient';
import { PALETTE } from '@/lib/toneColors';
import { reportClientError } from '@/lib/errorMonitoring';

const RANGE_PERIOD_LABEL = { '24H': 'Today', '7D': 'Last 7 Days', '30D': 'Last 30 Days', '90D': 'Last 90 Days', '1Y': 'Last Year' };

// `canLogWeight` shows the "Log weight" button (spec 0081 FR2). The page
// passes false for a pet the person only sits for: sitters can read
// weight but never write it.
export default function WeightCard({ petId, range, timezone, canLogWeight = false }) {
  const [state, setState] = useState({ loading: true, error: false, data: null });
  const [logOpen, setLogOpen] = useState(false);
  // Bumped after a save/edit/delete in the sheet so this card refetches.
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: false }));
    getWeightTrend(petId, range, timezone)
      .then((data) => { if (!cancelled) setState({ loading: false, error: false, data }); })
      .catch((err) => {
        reportClientError(err, { feature: 'trends', note: 'weight' });
        if (!cancelled) setState({ loading: false, error: true, data: null });
      });
    return () => { cancelled = true; };
  }, [petId, range, timezone, reloadKey]);

  const { loading, error, data } = state;
  const empty = !loading && !error && (!data || data.series.length === 0);
  const hasHistory = data?.hasAnyData;

  const logButton = canLogWeight ? (
    <Button type="button" variant="outline" onClick={() => setLogOpen(true)} className="rounded-full">
      <Plus aria-hidden="true" /> Log weight
    </Button>
  ) : null;

  return (
    <>
      <MetricCardShell
        icon={Scale}
        title="Weight"
        periodLabel={RANGE_PERIOD_LABEL[range]}
        loading={loading}
        error={error}
        empty={empty}
        emptyMessage={hasHistory ? 'No data in this range.' : 'No weight history available.'}
        emptyAction={logButton}
        errorAction={logButton}
      >
        {data && (
          <>
            <div className="flex items-baseline gap-1">
              <span className="text-[28px] font-bold text-white leading-none">{data.currentLbs}</span>
              <span className="text-[14px] text-tier-tertiary">lbs</span>
            </div>
            {data.deltaLbs != null && (
              <p className="text-[13px] font-medium mt-0.5 flex items-center gap-1" style={{ color: data.deltaLbs === 0 ? PALETTE.gray : PALETTE.amber }}>
                {data.deltaLbs < 0 ? <ArrowDown className="h-3.5 w-3.5" /> : data.deltaLbs > 0 ? <ArrowUp className="h-3.5 w-3.5" /> : null}
                {data.deltaLbs === 0 ? 'Steady' : `${data.deltaLbs < 0 ? 'Down' : 'Up'} ${Math.abs(data.deltaLbs)} lbs`}
              </p>
            )}
            <div className="mt-3">
              <TrendChart variant="line" series={data.series} range={range} color={PALETTE.sky} />
            </div>
            {logButton && <div className="mt-3 flex justify-end">{logButton}</div>}
          </>
        )}
      </MetricCardShell>
      {logOpen && (
        <WeightLogSheet
          petId={petId}
          timezone={timezone}
          onClose={() => setLogOpen(false)}
          onChanged={() => setReloadKey((k) => k + 1)}
        />
      )}
    </>
  );
}
