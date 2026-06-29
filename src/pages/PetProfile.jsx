import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { entities } from '@/api/entities';
import { ArrowLeft, Plus, X, ChevronRight, UtensilsCrossed, Zap, Heart, Scale, Upload, Menu, ClipboardList, Cat, Dog, Rainbow } from 'lucide-react';
import CareMenu from '../components/CareMenu';
import { format, parseISO, subDays } from 'date-fns';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, ReferenceLine, Tooltip, ResponsiveContainer } from 'recharts';
import SymptomLogForm from '../components/SymptomLogForm';
import PageTransition from '../components/PageTransition';
import usePullToRefresh from '../hooks/usePullToRefresh';
import PullToRefreshIndicator from '../components/PullToRefreshIndicator';

// ── Status helpers ─────────────────────────────────────────
const appetiteStatus = { 'Ate all': 'good', 'Ate most': 'good', 'Ate some': 'warn', 'Ate very little': 'warn', 'Refused': 'bad' };
const energyStatus = { Playful: 'good', Normal: 'good', Calm: 'good', Lethargic: 'warn', Hiding: 'bad' };
const appetiteNum = { 'Ate all': 4, 'Ate most': 3, 'Ate some': 2, 'Ate very little': 1, 'Refused': 0 };
const energyNum = { Playful: 4, Normal: 3, Calm: 2, Lethargic: 1, Hiding: 0 };

const STATUS_COLOR = { good: '#6EBBE7', warn: '#f59e0b', bad: '#ef4444' };
const BADGE = {
  good: 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20',
  warn: 'bg-amber-500/15 text-amber-400 border border-amber-500/20',
  bad: 'bg-red-500/15 text-red-400 border border-red-500/20',
  overdue: 'bg-red-500/15 text-red-400 border border-red-500/20',
  soon: 'bg-amber-500/15 text-amber-400 border border-amber-500/20',
  ok: 'bg-white/8 text-white/40 border border-white/10',
  due: 'bg-orange-500/15 text-orange-400 border border-orange-500/20',
};

function getMedStatus(med) {
  if (!med.next_due_date) return 'ok';
  const diffDays = Math.ceil((parseISO(med.next_due_date) - new Date()) / 86400000);
  if (diffDays <= 1) return 'due';
  if (diffDays <= 3) return 'soon';
  return 'ok';
}

function getVaxStatus(vax) {
  if (!vax.next_due_date) return 'ok';
  return parseISO(vax.next_due_date) < new Date() ? 'overdue' : 'ok';
}

function getBloodStatus(marker, value) {
  const ranges = { creatinine: [0.6, 2.4], bun: [14, 36], sdma: [0, 14], phosphorus: [2.4, 8.2], potassium: [3.5, 5.8], hematocrit: [24, 45], alt: [12, 130], glucose: [70, 150], t4: [0.8, 4.7] };
  const r = ranges[marker];
  if (!r || value == null) return 'ok';
  if (value < r[0] * 0.9 || value > r[1] * 1.2) return 'bad';
  if (value < r[0] || value > r[1]) return 'warn';
  return 'good';
}

// ── Oura-style score bubble ────────────────────────────────
function ScoreBubble({ icon, score, label, status, onClick }) {
  const color = STATUS_COLOR[status] || '#ffffff';
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center gap-1.5 active:opacity-70 transition-opacity flex-shrink-0"
      style={{ minWidth: 72 }}
    >
      <div className="relative w-16 h-16 rounded-full flex items-center justify-center"
        style={{ background: 'rgba(255,255,255,0.08)', border: `1.5px solid ${color}30` }}>
        <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 64 64">
          <circle cx="32" cy="32" r="28" fill="none" stroke={`${color}20`} strokeWidth="3" />
          {score != null && (
            <circle cx="32" cy="32" r="28" fill="none" stroke={color} strokeWidth="3"
              strokeDasharray={`${(score / 4) * 175.9} 175.9`}
              strokeLinecap="round" />
          )}
        </svg>
        {icon}
      </div>
      <div className="text-center">
        <p className="text-[15px] font-bold text-white leading-none">{score != null ? score : '—'}</p>
        <p className="text-[10px] text-white/40 mt-0.5 tracking-wide">{label}</p>
      </div>
    </button>
  );
}

// ── Oura-style chart card ──────────────────────────────────
function OuraChartCard({ title, value, valueLabel, to, children }) {
  const card = (
    <div className="rounded-2xl overflow-hidden" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
      <div className="px-5 pt-5 pb-2">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold tracking-widest uppercase text-white/35">{title}</p>
          {to && <ChevronRight className="h-4 w-4 text-white/25" />}
        </div>
        {value != null && (
          <div className="flex items-end gap-1 mt-1">
            <p className="text-4xl font-bold text-white leading-none">{value}</p>
            {valueLabel && <p className="text-sm text-white/40 mb-1">{valueLabel}</p>}
          </div>
        )}
      </div>
      <div className="pb-2">{children}</div>
    </div>
  );
  return to ? <Link to={to} className="block active:scale-[0.99] transition-transform">{card}</Link> : card;
}

// ── Quick log bottom sheet ─────────────────────────────────
function QuickLogSheet({ type, petId, onClose, onSuccess }) {
  const [val, setVal] = useState(null);
  const [saving, setSaving] = useState(false);
  const today = format(new Date(), 'yyyy-MM-dd');

  const save = async () => {
    setSaving(true);
    const existing = await entities.SymptomLog.filter({ pet_id: petId, date: today });
    if (existing.length) {
      await entities.SymptomLog.update(existing[0].id, { [type.field]: val });
    } else {
      await entities.SymptomLog.create({ pet_id: petId, date: today, [type.field]: val });
    }
    setSaving(false);
    onSuccess();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div className="relative rounded-t-3xl px-5 pt-5 pb-10 shadow-2xl" style={{ background: 'rgba(18,20,32,0.98)', border: '1px solid rgba(255,255,255,0.08)' }} onClick={e => e.stopPropagation()}>
        <div className="w-10 h-1 bg-white/20 rounded-full mx-auto mb-5" />
        <h3 className="text-xl font-bold text-white mb-1">Log {type.label}</h3>
        <p className="text-sm text-white/40 mb-5">Today · {format(new Date(), 'MMM d')}</p>
        {type.options && (
          <div className="grid grid-cols-3 gap-2 mb-5">
            {type.options.map(opt => (
              <button key={opt} onClick={() => setVal(opt)}
                className={`rounded-2xl py-3 text-sm font-semibold transition-all ${val === opt ? 'text-background' : 'text-white/60 border border-white/12 hover:border-white/25'}`}
                style={val === opt ? { background: '#6EBBE7', color: '#0D0F1A' } : { background: 'rgba(255,255,255,0.05)' }}
              >{opt}</button>
            ))}
          </div>
        )}
        {type.isNumber && (
          <div className="flex gap-3 mb-5 justify-center">
            {[0,1,2,3,4,'5+'].map(n => (
              <button key={n} onClick={() => setVal(n)}
                className={`w-12 h-12 rounded-2xl text-lg font-bold transition-all ${val === n ? 'text-background' : 'text-white/60 border border-white/12'}`}
style={val === n ? { background: '#6EBBE7', color: '#0D0F1A' } : { background: 'rgba(255,255,255,0.05)' }}
              >{n}</button>
            ))}
          </div>
        )}
        {type.isWeight && (
          <div className="mb-5">
            <input type="number" step="0.1" placeholder="e.g. 4.2"
              className="w-full rounded-2xl px-4 py-3 text-xl text-center font-bold text-white bg-white/8 focus:outline-none focus:ring-1 focus:ring-primary border border-white/10"
              onChange={e => setVal(parseFloat(e.target.value) * 1000)}
            />
            <p className="text-xs text-center text-white/30 mt-2">kilograms</p>
          </div>
        )}
        <button onClick={save} disabled={val == null || saving}
          className="w-full text-base font-bold rounded-2xl h-14 disabled:opacity-30 transition-opacity"
          style={{ background: '#6EBBE7', color: '#0D0F1A' }}
        >{saving ? 'Saving…' : 'Save'}</button>
      </div>
    </div>
  );
}

const QUICK_TYPES = {
  appetite: { label: 'Appetite', field: 'appetite', options: ['Ate all','Ate most','Ate some','Ate very little','Refused'] },
  energy:   { label: 'Energy',   field: 'energy_level', options: ['Playful','Normal','Calm','Lethargic','Hiding'] },
  vomiting: { label: 'Vomiting', field: 'vomiting', isNumber: true },
  weight:   { label: 'Weight',   field: 'weight_grams', isWeight: true },
};

// ── Main component ─────────────────────────────────────────
export default function PetProfile() {
  const { petId } = useParams();
  const [pet, setPet] = useState(null);
  const [logs, setLogs] = useState([]);
  const [medications, setMedications] = useState([]);
  const [bloodwork, setBloodwork] = useState([]);
  const [vaccinations, setVaccinations] = useState([]);
  const [foods, setFoods] = useState([]);
  const [loading, setLoading] = useState(true);
  const [logSheet, setLogSheet] = useState(null);
  const [fullLogOpen, setFullLogOpen] = useState(false);
  const [careOpen, setCareOpen] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    const [petData, logData, medData, bwData, vacData, foodData] = await Promise.all([
      entities.Pet.get(petId),
      entities.SymptomLog.filter({ pet_id: petId }, '-date', 200),
      entities.Medication.filter({ pet_id: petId, active: true }, '-start_date', 50),
      entities.Bloodwork.filter({ pet_id: petId }, '-date', 3),
      entities.Vaccination.filter({ pet_id: petId }, '-date_given', 20),
      entities.PetFood.filter({ pet_id: petId, active: true }),
    ]);
    const todayStr = new Date().toISOString().split('T')[0];
    setPet(petData); setLogs(logData); setMedications(medData);
    setBloodwork(bwData); setVaccinations(vacData);
    setFoods(foodData.filter(f => f.active && (!f.end_date || f.end_date >= todayStr)));
    setLoading(false);
  }, [petId]);

  useEffect(() => { loadData(); }, [loadData]);
  const { pullDistance, isRefreshing } = usePullToRefresh(loadData);

  if (loading) return (
    <div className="fixed inset-0 flex items-center justify-center bg-background">
      <div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
    </div>
  );
  if (!pet) return null;

  const latestLog = logs[0];
  const isMemorial = pet.is_memorial;

  // Scores (0–4 mapped to 0–100)
  const appetiteScore = latestLog?.appetite ? Math.round((appetiteNum[latestLog.appetite] / 4) * 100) : null;
  const energyScore = latestLog?.energy_level ? Math.round((energyNum[latestLog.energy_level] / 4) * 100) : null;
  const vomitScore = latestLog?.vomiting != null ? Math.max(0, 100 - latestLog.vomiting * 25) : null;
  const weightVal = latestLog?.weight_grams ? (latestLog.weight_grams / 1000).toFixed(2) : null;

  const scoreItems = [
    { icon: <UtensilsCrossed className="h-5 w-5 text-white" />, score: appetiteScore, label: 'Appetite', status: latestLog?.appetite ? appetiteStatus[latestLog.appetite] : 'good', key: 'appetite' },
    { icon: <Zap className="h-5 w-5 text-white" />, score: energyScore, label: 'Energy', status: latestLog?.energy_level ? energyStatus[latestLog.energy_level] : 'good', key: 'energy' },
    { icon: <Heart className="h-5 w-5 text-white" />, score: vomitScore, label: 'Symptoms', status: latestLog?.vomiting > 1 ? 'bad' : latestLog?.vomiting > 0 ? 'warn' : 'good', key: 'vomiting' },
    { icon: <Scale className="h-5 w-5 text-white" />, score: null, label: weightVal ? `${weightVal}kg` : 'Weight', status: 'good', key: 'weight' },
  ];

  // Chart data (last 30 days)
  const chartData = [...logs]
    .filter(l => parseISO(l.date) >= subDays(new Date(), 30))
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(l => ({
      label: format(parseISO(l.date), 'M/d'),
      appetite: appetiteNum[l.appetite] ?? null,
      energy: energyNum[l.energy_level] ?? null,
      vomiting: l.vomiting ?? 0,
      weight: l.weight_grams ? parseFloat((l.weight_grams / 1000).toFixed(2)) : null,
    }));
  const hasChartData = chartData.length >= 2;
  const hasWeight = chartData.some(d => d.weight != null);

  // Latest bloodwork
  const latestBW = bloodwork[0];
  const bwFields = latestBW ? [
    { label: 'Creatinine', key: 'creatinine', unit: 'mg/dL' },
    { label: 'BUN', key: 'bun', unit: 'mg/dL' },
    { label: 'SDMA', key: 'sdma', unit: 'µg/dL' },
    { label: 'Hematocrit', key: 'hematocrit', unit: '%' },
    { label: 'ALT', key: 'alt', unit: 'U/L' },
    { label: 'Glucose', key: 'glucose', unit: 'mg/dL' },
  ].filter(f => latestBW[f.key] != null) : [];

  const chartTooltipStyle = { background: 'rgba(18,20,32,0.95)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, fontSize: 11, color: '#fff' };

  return (
    <PageTransition>
      <div className="min-h-screen bg-background pb-28">
        <PullToRefreshIndicator pullDistance={pullDistance} isRefreshing={isRefreshing} />

        {/* ── HERO ── */}
        <div className="relative" style={{ height: 340 }}>
          {pet.photo_url ? (
            <img src={pet.photo_url} alt={pet.name} className={`w-full h-full object-cover ${isMemorial ? 'grayscale' : ''}`} />
          ) : (
            <div className="w-full h-full flex items-center justify-center" style={{ background: 'linear-gradient(160deg, rgba(0,212,170,0.15) 0%, rgba(10,12,22,1) 100%)' }}>
              {pet.species === 'Dog' ? <Dog className="h-24 w-24 text-white/40" /> : <Cat className="h-24 w-24 text-white/40" />}
            </div>
          )}
          {/* gradient overlay — strong at bottom, fades to subtle at top */}
          <div className="absolute inset-0" style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.3) 0%, rgba(10,12,22,0) 35%, rgba(10,12,22,0.85) 70%, rgba(10,12,22,1) 100%)' }} />

          {/* Top nav */}
          <div className="absolute top-0 inset-x-0 flex items-center justify-between px-4" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 12px)' }}>
            <Link to="/" className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(8px)' }}>
              <ArrowLeft className="h-5 w-5 text-white" />
            </Link>

            <div className="flex items-center gap-2">
              <button onClick={() => setCareOpen(true)} className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(8px)' }}>
                <Menu className="h-5 w-5 text-white" />
              </button>
            </div>
          </div>

          {/* Pet info at bottom of hero */}
          <div className="absolute bottom-0 left-0 right-0 px-5 pb-4">
            <h1 className="text-3xl font-bold text-white leading-tight">{pet.name}</h1>
            {pet.breed && <p className="text-sm text-white/50 mt-0.5">{pet.breed}</p>}
            {pet.conditions?.length > 0 && (
              <p className="text-sm text-white/50 mt-1.5 font-medium">
                {pet.conditions.join(' | ')}
              </p>
            )}
          </div>
        </div>

        {/* ── OURA-STYLE SCORE ROW ── */}
        {!isMemorial && (
          <div className="px-5 pt-5 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
            <div className="flex gap-5 pb-1" style={{ width: 'max-content' }}>
              {scoreItems.map(item => (
                <ScoreBubble key={item.key} {...item} onClick={() => setLogSheet(item.key)} />
              ))}
              <Link to={`/pet/${petId}/symptoms`} className="flex flex-col items-center justify-center gap-1.5 flex-shrink-0" style={{ minWidth: 72 }}>
                <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.08)', border: '1.5px solid rgba(255,255,255,0.12)' }}>
                  <ClipboardList className="h-5 w-5 text-white/50" />
                </div>
                <p className="text-[10px] text-white/40 mt-1 uppercase tracking-wide">All logs</p>
              </Link>
            </div>
          </div>
        )}

        <div className="px-4 pt-5 space-y-4 max-w-2xl mx-auto">

          {/* ── LOG TODAY BUTTON ── */}
          {!isMemorial && (
            <button onClick={() => setFullLogOpen(true)}
              className="w-full flex items-center justify-center gap-2 rounded-2xl py-3.5 text-sm font-semibold transition-all active:opacity-70"
              style={{ background: 'rgba(135,206,235,0.12)', border: '1px solid rgba(135,206,235,0.25)', color: '#6EBBE7' }}
            >
              <Plus className="h-4 w-4" /> Log today's symptoms
            </button>
          )}

          {/* ── TRENDS CHARTS ── */}
          {hasChartData && (
            <section className="space-y-3">
              <Link to={`/pet/${petId}/symptoms`} className="flex items-center justify-between px-1 group">
                <p className="text-xs font-bold uppercase tracking-widest text-white/30">30-Day Trends</p>
                <span className="flex items-center gap-0.5 text-xs font-semibold text-white/30 group-hover:text-white/60 transition-colors">
                  View all <ChevronRight className="h-3 w-3" />
                </span>
              </Link>

              <OuraChartCard title="Appetite & Energy" value={null} to={`/pet/${petId}/symptoms`}>
                <ResponsiveContainer width="100%" height={150}>
                  <LineChart data={chartData} margin={{ left: -20, right: 10, top: 5, bottom: 0 }}>
                    <XAxis dataKey="label" tick={{ fontSize: 9, fill: 'rgba(255,255,255,0.3)' }} axisLine={false} tickLine={false} />
                    <YAxis domain={[0,4]} ticks={[0,2,4]} tick={{ fontSize: 9, fill: 'rgba(255,255,255,0.3)' }} axisLine={false} tickLine={false} />
                    <ReferenceLine y={2} stroke="rgba(255,255,255,0.1)" strokeDasharray="4 4" />
                    <Tooltip contentStyle={chartTooltipStyle} cursor={{ stroke: 'rgba(255,255,255,0.1)' }} />
                    <Line type="monotone" dataKey="appetite" stroke="#6EBBE7" strokeWidth={2} dot={{ fill: '#6EBBE7', r: 2 }} name="Appetite" connectNulls />
                    <Line type="monotone" dataKey="energy" stroke="#60A5FA" strokeWidth={2} dot={{ fill: '#60A5FA', r: 2 }} name="Energy" connectNulls />
                  </LineChart>
                </ResponsiveContainer>
                <div className="flex gap-4 px-5 pb-3">
                  <span className="flex items-center gap-1.5 text-[11px] text-white/40"><span className="w-3 h-0.5 rounded-full bg-[#6EBBE7]" />Appetite</span>
                  <span className="flex items-center gap-1.5 text-[11px] text-white/40"><span className="w-3 h-0.5 rounded-full bg-[#60A5FA]" />Energy</span>
                </div>
              </OuraChartCard>

              <OuraChartCard title="Vomiting Episodes" value={null} to={`/pet/${petId}/symptoms`}>
                <ResponsiveContainer width="100%" height={110}>
                  <BarChart data={chartData} margin={{ left: -20, right: 10, top: 5, bottom: 0 }}>
                    <XAxis dataKey="label" tick={{ fontSize: 9, fill: 'rgba(255,255,255,0.3)' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 9, fill: 'rgba(255,255,255,0.3)' }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={chartTooltipStyle} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
                    <Bar dataKey="vomiting" fill="rgba(239,68,68,0.65)" radius={[3,3,0,0]} name="Vomiting" />
                  </BarChart>
                </ResponsiveContainer>
              </OuraChartCard>

              {hasWeight && (
                <OuraChartCard title="Weight (kg)" value={weightVal} valueLabel="kg" to={`/pet/${petId}/symptoms`}>
                  <ResponsiveContainer width="100%" height={110}>
                    <LineChart data={chartData} margin={{ left: -20, right: 10, top: 5, bottom: 0 }}>
                      <XAxis dataKey="label" tick={{ fontSize: 9, fill: 'rgba(255,255,255,0.3)' }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 9, fill: 'rgba(255,255,255,0.3)' }} axisLine={false} tickLine={false} />
                      <Tooltip contentStyle={chartTooltipStyle} cursor={{ stroke: 'rgba(255,255,255,0.1)' }} />
                      <Line type="monotone" dataKey="weight" stroke="white" strokeWidth={2} dot={{ fill: 'white', r: 2 }} name="Weight (kg)" connectNulls />
                    </LineChart>
                  </ResponsiveContainer>
                </OuraChartCard>
              )}
            </section>
          )}

          {/* ── MEDICATIONS ── */}
          {medications.length > 0 && (
            <section>
              <div className="flex items-center justify-between px-1 mb-3">
                <p className="text-xs font-bold uppercase tracking-widest text-white/30">Medications</p>
                <Link to={`/pet/${petId}/profile?tab=medications`} className="text-xs font-semibold" style={{ color: '#6EBBE7' }}>Manage →</Link>
                </div>
                <div className="rounded-2xl overflow-hidden" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
                {medications.map(med => {
                  const s = getMedStatus(med);
                  const dueLabel = med.next_due_date
                    ? s === 'due' ? 'Due today' : s === 'soon' ? `Due ${format(parseISO(med.next_due_date), 'MMM d')}` : format(parseISO(med.next_due_date), 'MMM d')
                    : med.frequency || '';
                  return (
                    <div key={med.id} className="flex items-center gap-3 px-4 py-3.5 border-b border-white/5 last:border-0">
                      <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: STATUS_COLOR[s] || '#00D4AA', boxShadow: `0 0 6px ${STATUS_COLOR[s] || '#00D4AA'}60` }} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-white truncate">{med.name}</p>
                        <p className="text-xs text-white/35 mt-0.5">{med.dosage}{med.dosage && med.frequency ? ' · ' : ''}{med.frequency}</p>
                      </div>
                      {dueLabel && <span className={`text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${BADGE[s]}`}>{dueLabel}</span>}
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* ── VACCINATIONS ── */}
          {vaccinations.length > 0 && (
            <section>
              <div className="flex items-center justify-between px-1 mb-3">
                <p className="text-xs font-bold uppercase tracking-widest text-white/30">Vaccinations</p>
                <Link to={`/pet/${petId}/profile?tab=vaccines`} className="text-xs font-semibold" style={{ color: '#6EBBE7' }}>Manage →</Link>
                </div>
                <div className="rounded-2xl overflow-hidden" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
                {vaccinations.map(vax => {
                  const s = getVaxStatus(vax);
                  return (
                    <div key={vax.id} className="flex items-center gap-3 px-4 py-3.5 border-b border-white/5 last:border-0">
                      <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: STATUS_COLOR[s] || '#00D4AA', boxShadow: `0 0 6px ${STATUS_COLOR[s] || '#00D4AA'}60` }} />
                      <div className="flex-1">
                        <p className="text-sm font-semibold text-white">{vax.vaccine_name}</p>
                        {vax.next_due_date && <p className="text-xs text-white/35 mt-0.5">{s === 'overdue' ? 'Overdue — ' : 'Due '}{format(parseISO(vax.next_due_date), 'MMM d, yyyy')}</p>}
                      </div>
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${BADGE[s]}`}>{s === 'overdue' ? 'Overdue' : 'Current'}</span>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* ── BLOODWORK ── */}
          {latestBW && bwFields.length > 0 && (
            <section>
              <div className="flex items-center justify-between px-1 mb-3">
                <p className="text-xs font-bold uppercase tracking-widest text-white/30">Latest Bloodwork</p>
                <Link to={`/pet/${petId}/profile?tab=bloodwork`} className="text-xs font-semibold" style={{ color: '#6EBBE7' }}>Manage →</Link>
              </div>
              <Link to={`/pet/${petId}/profile?tab=bloodwork`} className="block active:scale-[0.99] transition-transform">
                <div className="rounded-2xl overflow-hidden" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
                  {bwFields.map(f => {
                    const s = getBloodStatus(f.key, latestBW[f.key]);
                    return (
                      <div key={f.key} className="flex items-center gap-3 px-4 py-3 border-b border-white/5 last:border-0">
                        <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: STATUS_COLOR[s] || '#00D4AA' }} />
                        <p className="flex-1 text-sm text-white">{f.label}</p>
                        <span className="text-sm font-bold text-white mr-1">{latestBW[f.key]}</span>
                        <span className="text-xs text-white/30 mr-2">{f.unit}</span>
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${BADGE[s]}`}>{s === 'good' ? 'Normal' : s === 'warn' ? 'Elevated' : 'High'}</span>
                      </div>
                    );
                  })}
                  <div className="flex items-center gap-2 px-4 py-3 border-t border-white/5" style={{ background: 'rgba(110,187,231,0.06)' }}>
                    <Upload className="h-3.5 w-3.5" style={{ color: '#6EBBE7' }} />
                    <span className="text-xs font-semibold" style={{ color: '#6EBBE7' }}>Upload lab report (PDF or photo)</span>
                  </div>
                </div>
              </Link>
            </section>
          )}

          {/* ── FOOD ── */}
          {foods.length > 0 && (
            <section>
              <Link to={`/pet/${petId}/food`} className="flex items-center justify-between px-1 mb-3 group">
                <p className="text-xs font-bold uppercase tracking-widest text-white/30">Current Diet</p>
                <span className="flex items-center gap-0.5 text-xs font-semibold text-white/30 group-hover:text-white/60 transition-colors">
                  View history <ChevronRight className="h-3 w-3" />
                </span>
              </Link>
              <Link to={`/pet/${petId}/food`} className="block active:scale-[0.99] transition-transform">
                <div className="rounded-2xl overflow-hidden" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
                  {foods.map(food => (
                    <div key={food.id} className="flex items-center gap-3 px-4 py-3.5 border-b border-white/5 last:border-0">
                      <UtensilsCrossed className="h-4 w-4 text-white/40 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-white truncate">{food.name}</p>
                        {food.food_type && <p className="text-xs text-white/35">{food.food_type}{food.brand ? ` · ${food.brand}` : ''}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              </Link>
            </section>
          )}

          {/* ── RECENT LOGS ── */}
          {logs.length > 0 && (
            <section className="pb-4">
              <div className="flex items-center justify-between px-1 mb-3">
                <p className="text-xs font-bold uppercase tracking-widest text-white/30">Recent Logs</p>
                <Link to={`/pet/${petId}/symptoms`} className="text-xs font-semibold" style={{ color: '#6EBBE7' }}>Full history →</Link>
              </div>
              <div className="space-y-2">
                {logs.slice(0, 5).map(log => (
                  <div key={log.id} className="rounded-xl px-4 py-3 flex items-center gap-3" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
                    <span className="text-xs font-bold text-white/30 w-14 flex-shrink-0">{format(parseISO(log.date), 'MMM d')}</span>
                    <div className="flex flex-wrap gap-1.5">
                      {log.appetite && <span className="inline-flex items-center gap-1 text-xs text-white/55 border border-white/10 rounded-full px-2 py-0.5" style={{ background: 'rgba(255,255,255,0.06)' }}><UtensilsCrossed className="h-3 w-3" />{log.appetite}</span>}
                      {log.energy_level && <span className="inline-flex items-center gap-1 text-xs text-white/55 border border-white/10 rounded-full px-2 py-0.5" style={{ background: 'rgba(255,255,255,0.06)' }}><Zap className="h-3 w-3" />{log.energy_level}</span>}
                      {log.vomiting > 0 && <span className="inline-flex items-center gap-1 text-xs text-red-400 border border-red-500/20 rounded-full px-2 py-0.5" style={{ background: 'rgba(239,68,68,0.1)' }}><Heart className="h-3 w-3" />×{log.vomiting}</span>}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Memorial */}
          {isMemorial && (
            <div className="py-8 text-center flex flex-col items-center">
              <Rainbow className="h-8 w-8 mb-2 text-purple-300" />
              <p className="text-base font-semibold text-purple-300">Forever in our hearts</p>
              {pet.memorial_date && <p className="text-sm text-purple-400/60 mt-1">{format(parseISO(pet.memorial_date), 'MMMM d, yyyy')}</p>}
            </div>
          )}
        </div>

        {/* Quick log sheet */}
        {logSheet && (
          <QuickLogSheet type={QUICK_TYPES[logSheet]} petId={petId} onClose={() => setLogSheet(null)} onSuccess={loadData} />
        )}

        <CareMenu open={careOpen} onOpenChange={setCareOpen} petId={petId} petName={pet?.name} />

        {/* Full log sheet */}
        {fullLogOpen && (
          <div className="fixed inset-0 z-50 bg-background overflow-y-auto">
            <div className="sticky top-0 z-10 bg-background border-b border-border px-4 py-3 flex items-center justify-between" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 12px)' }}>
              <h2 className="font-bold text-xl text-white">Log Symptoms</h2>
              <button onClick={() => setFullLogOpen(false)} className="h-9 w-9 rounded-full bg-white/8 flex items-center justify-center">
                <X className="h-4 w-4 text-white" />
              </button>
            </div>
            <div className="px-4 py-5 pb-32">
              <SymptomLogForm petId={petId} onOptimisticUpdate={() => setFullLogOpen(false)} onSuccess={loadData} />
            </div>
          </div>
        )}
      </div>
    </PageTransition>
  );
}