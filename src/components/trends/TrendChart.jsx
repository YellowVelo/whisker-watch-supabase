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

const NOT_OBSERVED_COLOR = 'rgba(255,255,255,0.25)';
const SKIPPED_COLOR = 'rgba(255,255,255,0.15)';

function observationBarColor(d) {
  if (d.state === 'skipped') return SKIPPED_COLOR;
  if (d.state === 'not_observed') return NOT_OBSERVED_COLOR;
  return SYMPTOM_COUNT_COLOR[Math.min(2, d.count ?? 0)] ?? PALETTE.gray;
}

function observationTooltipLabel(payload) {
  if (payload.state === 'skipped') return 'Skipped';
  if (payload.state === 'not_observed') return 'Not Observed';
  return SYMPTOM_COUNT_LABEL[Math.min(2, payload.count ?? 0)] ?? 'No Data';
}

// variant="observation" — every counted category. One bar per day, height
// + color from that day's symptom count (0/1/2+, equal weight — not a
// graded "how bad" direction). Skipped days render as a flat, low-opacity
// marker distinct from a missing gap; "Not Observed" (Water/Bathroom only)
// renders as its own distinct flat marker, never collapsed into Normal or
// Skipped (spec Attribute Model).
function ObservationVariant({ series, range, height = 140 }) {
  const data = series.map((p) => ({
    ...p,
    label: formatTick(p.date, range),
    barHeight: p.state === 'skipped' || p.state === 'not_observed' ? 0.5 : p.count == null ? 0 : Math.min(2, p.count) + 1,
  }));

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
        <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'rgba(255,255,255,0.35)' }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
        <YAxis hide domain={[0, 3]} />
        <Tooltip
          contentStyle={{ background: '#1a1d21', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 12 }}
          labelStyle={{ color: 'rgba(255,255,255,0.6)' }}
          formatter={(_, __, { payload }) => [observationTooltipLabel(payload), '']}
        />
        <Bar dataKey="barHeight" radius={[3, 3, 3, 3]} maxBarSize={14}>
          {data.map((d, i) => <Cell key={i} fill={observationBarColor(d)} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// variant="vomitingNausea" — Health group's combined panel (spec: "Trends
// should revert to previous versions"), two bars per day (Vomiting, then
// Nausea), reusing the same per-day symptom-count color/state rules as the
// single-attribute variant above.
function VomitingNauseaVariant({ series, range }) {
  const data = series.map((p) => ({
    label: formatTick(p.date, range),
    vomiting: p.vomiting,
    nausea: p.nausea,
    vomitingHeight: p.vomiting.state === 'skipped' || p.vomiting.state === 'not_observed' ? 0.5 : p.vomiting.count == null ? 0 : Math.min(2, p.vomiting.count) + 1,
    nauseaHeight: p.nausea.state === 'skipped' || p.nausea.state === 'not_observed' ? 0.5 : p.nausea.count == null ? 0 : Math.min(2, p.nausea.count) + 1,
  }));

  return (
    <ResponsiveContainer width="100%" height={140}>
      <BarChart data={data} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
        <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'rgba(255,255,255,0.35)' }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
        <YAxis hide domain={[0, 3]} />
        <Tooltip
          contentStyle={{ background: '#1a1d21', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 12 }}
          labelStyle={{ color: 'rgba(255,255,255,0.6)' }}
          formatter={(value, name, { payload }) => [observationTooltipLabel(name === 'vomitingHeight' ? payload.vomiting : payload.nausea), name === 'vomitingHeight' ? 'Vomiting' : 'Nausea']}
        />
        <Bar dataKey="vomitingHeight" name="vomitingHeight" radius={[3, 3, 0, 0]} maxBarSize={10}>
          {data.map((d, i) => <Cell key={i} fill={observationBarColor(d.vomiting)} />)}
        </Bar>
        <Bar dataKey="nauseaHeight" name="nauseaHeight" radius={[3, 3, 0, 0]} maxBarSize={10}>
          {data.map((d, i) => <Cell key={i} fill={observationBarColor(d.nausea)} fillOpacity={0.6} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export default function TrendChart({ variant, series, range, yDomain = null, color = PALETTE.sky, highlightExtremes = false, height }) {
  if (!series || series.length === 0) return null;
  if (variant === 'observation') return <ObservationVariant series={series} range={range} height={height} />;
  if (variant === 'vomitingNausea') return <VomitingNauseaVariant series={series} range={range} />;
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
