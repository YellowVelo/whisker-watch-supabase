import { useMemo } from 'react';
import { LineChart, Line, BarChart, Bar, Cell, XAxis, YAxis, ResponsiveContainer, Tooltip } from 'recharts';
import { format, parseISO } from 'date-fns';
import { SYMPTOM_COUNT_LABEL, SYMPTOM_COUNT_COLOR } from '@/lib/checkin/trendsClient';
import { PALETTE } from '@/lib/toneColors';

// One reusable chart, two variants (Trends Feature Spec: "Charts should
// share one reusable chart component. Only data configuration changes.").
// Follows the app's existing raw-recharts precedent (SymptomTrends.jsx)
// rather than the unused shadcn chart wrapper, for consistency.

function formatTick(dateStr, range) {
  const d = parseISO(dateStr);
  return range === '1Y' ? format(d, 'MMM yyyy') : format(d, 'MMM d');
}

// variant="line" — Wellness Score / Weight. Highlights current/min/max
// when highlightExtremes is set (Wellness Score spec requirement).
function LineVariant({ series, range, yDomain, color = PALETTE.sky, highlightExtremes }) {
  const data = series.map((p) => ({ ...p, label: formatTick(p.date, range) }));
  const { minIdx, maxIdx } = useMemo(() => {
    if (!highlightExtremes || data.length === 0) return { minIdx: -1, maxIdx: -1 };
    let min = 0, max = 0;
    data.forEach((d, i) => { if (d.value < data[min].value) min = i; if (d.value > data[max].value) max = i; });
    return { minIdx: min, maxIdx: max };
  }, [data, highlightExtremes]);

  const renderDot = (props) => {
    const { cx, cy, index } = props;
    const isLast = index === data.length - 1;
    const isMin = index === minIdx && minIdx !== maxIdx;
    const isMax = index === maxIdx && minIdx !== maxIdx;
    if (!isLast && !isMin && !isMax) return null;
    const dotColor = isLast ? color : isMax ? PALETTE.teal : PALETTE.red;
    return <circle key={`dot-${index}`} cx={cx} cy={cy} r={4} fill={dotColor} stroke="rgba(0,0,0,0.3)" strokeWidth={1} />;
  };

  // Thin out axis ticks for long ranges (spec edge case: "Extremely long
  // histories (>1 year)") — otherwise up to 365 overlapping labels render.
  const tickInterval = data.length > 14 ? Math.ceil(data.length / 6) : 0;

  return (
    <ResponsiveContainer width="100%" height={160}>
      <LineChart data={data} margin={{ top: 8, right: 4, left: -20, bottom: 0 }}>
        <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'rgba(255,255,255,0.35)' }} axisLine={false} tickLine={false} interval={tickInterval} />
        <YAxis domain={yDomain || ['auto', 'auto']} tick={{ fontSize: 10, fill: 'rgba(255,255,255,0.35)' }} axisLine={false} tickLine={false} width={32} />
        <Tooltip
          contentStyle={{ background: '#1a1d21', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 12 }}
          labelStyle={{ color: 'rgba(255,255,255,0.6)' }}
        />
        <Line type="monotone" dataKey="value" stroke={color} strokeWidth={2} dot={renderDot} connectNulls />
      </LineChart>
    </ResponsiveContainer>
  );
}

// variant="observation" — all 9 multi-select categories. One bar per day,
// height + color from that day's symptom count (0/1/2+, equal weight —
// not a graded "how bad" direction); skipped days render as a flat,
// low-opacity marker distinct from a missing gap.
function ObservationVariant({ series, range }) {
  const data = series.map((p) => ({
    ...p,
    label: formatTick(p.date, range),
    height: p.state === 'skipped' ? 0.5 : p.count == null ? 0 : Math.min(2, p.count) + 1,
  }));

  return (
    <ResponsiveContainer width="100%" height={90}>
      <BarChart data={data} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
        <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'rgba(255,255,255,0.35)' }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
        <YAxis hide domain={[0, 3]} />
        <Tooltip
          contentStyle={{ background: '#1a1d21', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 12 }}
          labelStyle={{ color: 'rgba(255,255,255,0.6)' }}
          formatter={(_, __, { payload }) => [payload.state === 'skipped' ? 'Skipped' : SYMPTOM_COUNT_LABEL[Math.min(2, payload.count ?? 0)] ?? 'No Data', '']}
        />
        <Bar dataKey="height" radius={[3, 3, 3, 3]} maxBarSize={14}>
          {data.map((d, i) => (
            <Cell key={i} fill={d.state === 'skipped' ? 'rgba(255,255,255,0.15)' : SYMPTOM_COUNT_COLOR[Math.min(2, d.count ?? 0)] ?? PALETTE.gray} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export default function TrendChart({ variant, series, range, yDomain = null, color = PALETTE.sky, highlightExtremes = false }) {
  if (!series || series.length === 0) return null;
  if (variant === 'observation') return <ObservationVariant series={series} range={range} />;
  return <LineVariant series={series} range={range} yDomain={yDomain} color={color} highlightExtremes={highlightExtremes} />;
}

export function ObservationLegend() {
  return (
    <div className="flex flex-col gap-1 text-[11px] text-white/40 flex-shrink-0 pl-2">
      {[2, 1, 0].map((count) => (
        <div key={count} className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ background: SYMPTOM_COUNT_COLOR[count] }} />
          <span>{SYMPTOM_COUNT_LABEL[count]}</span>
        </div>
      ))}
    </div>
  );
}
