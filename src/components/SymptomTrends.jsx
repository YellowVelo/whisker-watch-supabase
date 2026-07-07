import { useMemo, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Legend } from 'recharts';
import { format, parseISO, subDays } from 'date-fns';

const appetiteMap = { 'Ate all': 4, 'Ate most': 3, 'Ate some': 2, 'Ate very little': 1, 'Refused': 0 };
const energyMap = { Playful: 4, Normal: 3, Calm: 2, Lethargic: 1, Hiding: 0 };
const stoolMap = { Normal: 3, Soft: 2, Loose: 1, Watery: 0, Bloody: 0, Constipated: 1, None: null };

const RANGES = [
  { label: '7 days', days: 7 },
  { label: '14 days', days: 14 },
  { label: '30 days', days: 30 },
  { label: 'All', days: null },
];

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-border rounded-lg p-2.5 text-xs shadow-md">
      <p className="font-medium mb-1">{label}</p>
      {payload.map(p => (
        <p key={p.name} style={{ color: p.color }}>{p.name}: {p.value ?? '—'}</p>
      ))}
    </div>
  );
};

export default function SymptomTrends({ logs }) {
  const [range, setRange] = useState(30);

  const data = useMemo(() => {
    const filtered = range
      ? logs.filter(l => parseISO(l.date) >= subDays(new Date(), range))
      : logs;
    return [...filtered]
      .sort((a, b) => a.date.localeCompare(b.date))
      .map(l => ({
        label: format(parseISO(l.date), 'MMM d'),
        appetite: appetiteMap[l.appetite] ?? null,
        energy: energyMap[l.energy_level] ?? null,
        stool: stoolMap[l.stool_quality] ?? null,
        vomiting: l.vomiting ?? 0,
        weight: l.weight_grams ? parseFloat((l.weight_grams / 453.592).toFixed(2)) : null,
        nausea: l.nausea_symptoms?.length || 0,
      }));
  }, [logs, range]);

  if (data.length < 2) {
    return <div className="text-center py-8 text-muted-foreground text-sm">Need at least 2 logs to show trends.</div>;
  }

  const hasWeight = data.some(d => d.weight !== null);
  const hasNausea = data.some(d => d.nausea > 0);

  return (
    <div className="space-y-6">
      {/* Range selector */}
      <div className="flex gap-1.5">
        {RANGES.map(r => (
          <button
            key={r.label}
            onClick={() => setRange(r.days)}
            className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
              range === r.days ? 'bg-primary text-primary-foreground border-primary' : 'bg-background text-foreground border-border hover:border-primary/50'
            }`}
          >
            {r.label}
          </button>
        ))}
      </div>

      {/* Appetite & Energy */}
      <div className="bg-card border border-border rounded-xl p-4">
        <h4 className="text-sm font-medium mb-1">{"Appetite & Energy"}</h4>
        <p className="text-sm text-muted-foreground mb-3">0 = worst, 4 = best</p>
        <ResponsiveContainer width="100%" height={180}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="label" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
            <YAxis domain={[0, 4]} ticks={[0,1,2,3,4]} tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
            <Tooltip content={<CustomTooltip />} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Line type="monotone" dataKey="appetite" stroke="hsl(var(--chart-1))" strokeWidth={2} dot={{ r: 3 }} name="Appetite" connectNulls />
            <Line type="monotone" dataKey="energy" stroke="hsl(var(--chart-2))" strokeWidth={2} dot={{ r: 3 }} name="Energy" connectNulls />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Vomiting & Nausea */}
      <div className="bg-card border border-border rounded-xl p-4">
        <h4 className="text-sm font-medium mb-3">Vomiting {hasNausea ? '& Nausea Symptoms' : ''}</h4>
        <ResponsiveContainer width="100%" height={160}>
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="label" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
            <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
            <Tooltip content={<CustomTooltip />} />
            {hasNausea && <Legend wrapperStyle={{ fontSize: 11 }} />}
            <Bar dataKey="vomiting" fill="hsl(var(--chart-5))" name="Vomiting" radius={[3,3,0,0]} />
            {hasNausea && <Bar dataKey="nausea" fill="hsl(var(--chart-2))" name="Nausea symptoms" radius={[3,3,0,0]} />}
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Stool */}
      <div className="bg-card border border-border rounded-xl p-4">
        <h4 className="text-sm font-medium mb-1">Stool Quality</h4>
        <p className="text-sm text-muted-foreground mb-3">0 = abnormal, 3 = normal</p>
        <ResponsiveContainer width="100%" height={140}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="label" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
            <YAxis domain={[0, 3]} ticks={[0,1,2,3]} tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
            <Tooltip content={<CustomTooltip />} />
            <Line type="monotone" dataKey="stool" stroke="hsl(var(--chart-4))" strokeWidth={2} dot={{ r: 3 }} name="Stool" connectNulls />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Weight */}
      {hasWeight && (
        <div className="bg-card border border-border rounded-xl p-4">
          <h4 className="text-sm font-medium mb-3">Weight (lbs)</h4>
          <ResponsiveContainer width="100%" height={140}>
            <LineChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="label" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
              <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
              <Tooltip content={<CustomTooltip />} />
              <Line type="monotone" dataKey="weight" stroke="hsl(var(--chart-3))" strokeWidth={2} dot={{ r: 3 }} name="Weight (lbs)" connectNulls />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}