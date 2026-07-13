import { useEffect, useState } from 'react';
import { Loader2 as VomitIcon } from 'lucide-react';
import MetricCardShell from './MetricCardShell';
import TrendChart, { ObservationLegend } from './TrendChart';
import { getVomitingNauseaTrend } from '@/lib/checkin/trendsClient';

// Health group's combined Vomiting + Nausea panel — the Trends screen's
// reversion to the previous grouped-chart layout (spec: "Trends should
// revert to previous versions"). Vomiting and Nausea are both Health
// Attributes, so — unlike the old Appetite+Energy pairing, which crossed
// the Health/Wellbeing split this screen's group toggle depends on — this
// combination stays entirely within one group.
export default function VomitingNauseaCard({ petId, range, timezone }) {
  const [state, setState] = useState({ loading: true, error: false, data: null });

  useEffect(() => {
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: false }));
    getVomitingNauseaTrend(petId, range, timezone)
      .then((data) => { if (!cancelled) setState({ loading: false, error: false, data }); })
      .catch(() => { if (!cancelled) setState({ loading: false, error: true, data: null }); });
    return () => { cancelled = true; };
  }, [petId, range, timezone]);

  const { loading, error, data } = state;
  const empty = !loading && !error && (!data || data.series.length === 0);
  const hasHistory = data?.hasAnyData;

  return (
    <MetricCardShell
      icon={VomitIcon}
      title="Vomiting & Nausea"
      periodLabel="Today"
      loading={loading}
      error={error}
      empty={empty}
      emptyMessage={hasHistory ? 'No data in this range.' : 'No vomiting or nausea history available yet.'}
    >
      {data && (
        <>
          <p className="text-[13px] text-white/40 mb-2">
            {data.vomiting.currentLabel || 'No Data'}{data.nausea.currentLabel ? ` · Nausea: ${data.nausea.currentLabel}` : ''}
          </p>
          <div className="flex items-end gap-2">
            <div className="flex-1 min-w-0">
              <TrendChart variant="vomitingNausea" series={data.series} range={range} />
            </div>
            <ObservationLegend />
          </div>
        </>
      )}
    </MetricCardShell>
  );
}
