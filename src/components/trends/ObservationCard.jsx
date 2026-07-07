import { useEffect, useState } from 'react';
import MetricCardShell from './MetricCardShell';
import TrendChart, { ObservationLegend } from './TrendChart';
import { getObservationTrend } from '@/lib/checkin/trendsClient';
import { PALETTE } from '@/lib/toneColors';

// One generic card, instantiated for Appetite/Water Intake/Energy in
// PetTrends.jsx (Product Principle 19/20: "Favor Reusable Models" /
// "Build for Reuse") instead of three near-duplicate components.
export default function ObservationCard({ petId, range, code, label, icon }) {
  const [state, setState] = useState({ loading: true, error: false, data: null });

  useEffect(() => {
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: false }));
    getObservationTrend(petId, code, range)
      .then((data) => { if (!cancelled) setState({ loading: false, error: false, data }); })
      .catch(() => { if (!cancelled) setState({ loading: false, error: true, data: null }); });
    return () => { cancelled = true; };
  }, [petId, code, range]);

  const { loading, error, data } = state;
  const empty = !loading && !error && (!data || data.series.length === 0);
  const hasHistory = data?.hasAnyData;

  return (
    <MetricCardShell
      icon={icon}
      title={label}
      periodLabel="Today"
      loading={loading}
      error={error}
      empty={empty}
      emptyMessage={hasHistory ? 'No data in this range.' : `No ${label.toLowerCase()} history available yet.`}
    >
      {data && (
        <>
          <p className="text-[20px] font-bold" style={{ color: data.currentLabel === 'Normal' || !data.currentLabel ? '#fff' : PALETTE.amber }}>
            {data.currentLabel || 'No Data'}
          </p>
          <p className="text-[13px] text-white/40 mb-2">
            {data.currentSubtitle || (data.hasAnyData ? "Not checked in today" : 'No recent observations')}
          </p>
          <div className="flex items-end gap-2">
            <div className="flex-1 min-w-0">
              <TrendChart variant="observation" series={data.series} range={range} />
            </div>
            <ObservationLegend />
          </div>
        </>
      )}
    </MetricCardShell>
  );
}
