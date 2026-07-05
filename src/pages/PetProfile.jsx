import { useState, useEffect, useCallback } from 'react';
import { useParams, useSearchParams, Link, useNavigate } from 'react-router-dom';
import { entities } from '@/api/entities';
import { supabase } from '@/api/supabaseClient';
import {
  ArrowLeft, Plus, ChevronRight, UtensilsCrossed, Zap, Heart, Scale, Menu, ClipboardList, Cat, Dog, Rainbow, Activity,
  Pencil, UserPlus, Trash2, Sparkles, Clock, FileText, Folder,
} from 'lucide-react';
import CareMenu from '../components/CareMenu';
import { format, parseISO, subDays } from 'date-fns';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, ReferenceLine, Tooltip, ResponsiveContainer } from 'recharts';
import DailyCheckInSheet from '../components/DailyCheckInSheet';
import EditPetSheet from '../components/EditPetSheet';
import InviteCoOwnerDialog from '../components/InviteCoOwnerDialog';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import PageTransition from '../components/PageTransition';
import usePullToRefresh from '../hooks/usePullToRefresh';
import PullToRefreshIndicator from '../components/PullToRefreshIndicator';
import { track } from '@/lib/analytics';
import { getLatestWellness } from '@/lib/checkin/checkinClient';
import { scoreLabel, explainScore } from '@/lib/checkin/scoring';
import { getPetLabel } from '@/lib/speciesConfig';
import { computeAge } from '@/lib/lifeStage';

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
  ok: 'bg-white/10 text-white/40 border border-white/10',
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
// maxScore lets the same bubble represent either a 0–4 quick-log scale
// (appetite/energy/vomiting) or the 0–100 Wellness Score.
function ScoreBubble({ icon, score, label, status, onClick, maxScore = 4 }) {
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
              strokeDasharray={`${(score / maxScore) * 175.9} 175.9`}
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
function OuraChartCard({ title, value, valueLabel, to, alert, children }) {
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
        {alert && <p className="text-xs mt-2" style={{ color: STATUS_COLOR.warn }}>{alert}</p>}
      </div>
      <div className="pb-2">{children}</div>
    </div>
  );
  return to ? <Link to={to} className="block active:scale-[0.99] transition-transform">{card}</Link> : card;
}

// Plain summary card used for the new Profile/Baseline/Conditions/Timeline/
// Health Records slots — a header row + optional body, linking out to the
// existing feature that owns the detail.
function SectionCard({ title, to, alert, children }) {
  const inner = (
    <div className="rounded-2xl overflow-hidden" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
      <div className="flex items-center justify-between px-5 pt-4 pb-1">
        <p className="text-xs font-semibold tracking-widest uppercase text-white/35">{title}</p>
        {to && <ChevronRight className="h-4 w-4 text-white/25" />}
      </div>
      {alert && <p className="text-xs px-5 pt-1" style={{ color: STATUS_COLOR.warn }}>{alert}</p>}
      <div className="px-5 pb-4 pt-2">{children}</div>
    </div>
  );
  return to ? <Link to={to} className="block active:scale-[0.99] transition-transform">{inner}</Link> : inner;
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
              className="w-full rounded-2xl px-4 py-3 text-xl text-center font-bold text-white focus:outline-none focus:ring-1 focus:ring-primary border border-white/10"
              style={{ background: 'rgba(255,255,255,0.08)' }}
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
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [pet, setPet] = useState(null);
  const [logs, setLogs] = useState([]);
  const [medications, setMedications] = useState([]);
  const [bloodwork, setBloodwork] = useState([]);
  const [vaccinations, setVaccinations] = useState([]);
  const [foods, setFoods] = useState([]);
  const [onboarding, setOnboarding] = useState(null);
  const [wellness, setWellness] = useState(null); // { latest, trend } | null
  const [loading, setLoading] = useState(true);
  const [logSheet, setLogSheet] = useState(null);
  const [checkInOpen, setCheckInOpen] = useState(false);
  const [careOpen, setCareOpen] = useState(false);

  // Profile-section identity/management state (moved here from Settings.jsx —
  // pet management belongs in the Pet Profile, not owner-level Menu).
  const [editOpen, setEditOpen] = useState(false);
  const [coOwnerOpen, setCoOwnerOpen] = useState(false);
  const [currentUserId, setCurrentUserId] = useState(null);
  const [petCoOwners, setPetCoOwners] = useState([]);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [deletePetStep, setDeletePetStep] = useState(0); // 0=closed 1=warning 2=confirm
  const [deletePetConfirmText, setDeletePetConfirmText] = useState('');
  const [deletingPet, setDeletingPet] = useState(false);
  const [deletePetError, setDeletePetError] = useState('');

  useEffect(() => {
    const goOnline = () => setIsOnline(true);
    const goOffline = () => setIsOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setCurrentUserId(data?.user?.id ?? null));
  }, []);

  useEffect(() => {
    entities.PetCoOwner.filter({ pet_id: petId }).then(setPetCoOwners).catch(() => setPetCoOwners([]));
  }, [petId]);

  const loadData = useCallback(async () => {
    setLoading(true);
    const [petData, logData, medData, bwData, vacData, foodData, wellnessData, onboardingRows] = await Promise.all([
      entities.Pet.get(petId),
      entities.SymptomLog.filter({ pet_id: petId }, '-date', 200),
      entities.Medication.filter({ pet_id: petId, active: true }, '-start_date', 50),
      entities.Bloodwork.filter({ pet_id: petId }, '-date', 3),
      entities.Vaccination.filter({ pet_id: petId }, '-date_given', 20),
      entities.PetFood.filter({ pet_id: petId, active: true }),
      getLatestWellness(petId),
      entities.PetOnboarding.filter({ pet_id: petId }),
    ]);
    const todayStr = new Date().toISOString().split('T')[0];
    setPet(petData); setLogs(logData); setMedications(medData);
    setBloodwork(bwData); setVaccinations(vacData);
    setFoods(foodData.filter(f => f.active && (!f.end_date || f.end_date >= todayStr)));
    setWellness(wellnessData);
    setOnboarding(onboardingRows[0] || null);
    setLoading(false);
  }, [petId]);

  useEffect(() => { loadData(); }, [loadData]);
  const { pullDistance, isRefreshing } = usePullToRefresh(loadData);

  useEffect(() => {
    if (searchParams.get('startCheckin') === '1') {
      track('daily_check_in_started', { pet_id: petId, check_in_date: format(new Date(), 'yyyy-MM-dd') });
      setCheckInOpen(true);
      setSearchParams((prev) => { prev.delete('startCheckin'); return prev; }, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const openDeletePetFlow = () => {
    setDeletePetError('');
    setDeletePetConfirmText('');
    setDeletePetStep(1);
    track('pet_delete_started', { pet_id: petId });
  };
  const closeDeletePetFlow = () => {
    if (!deletingPet) {
      setDeletePetStep(0);
      setDeletePetConfirmText('');
      setDeletePetError('');
      track('pet_delete_cancelled', { pet_id: petId });
    }
  };
  const handleDeletePet = async () => {
    setDeletingPet(true);
    setDeletePetError('');
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      const { data, error } = await supabase.functions.invoke('delete-pet', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: { pet_id: petId },
      });
      if (error || !data?.success) {
        setDeletePetError(error?.message ?? data?.error ?? "We couldn't delete this pet. Please try again.");
        setDeletingPet(false);
        return;
      }
      track('pet_deleted', { pet_id: petId, mode: data.mode });
      navigate('/', { state: { petDeleted: true, petName: data.pet_name, mode: data.mode } });
    } catch (e) {
      setDeletePetError("We couldn't delete this pet. Please try again.");
      setDeletingPet(false);
    }
  };

  if (loading) return (
    <div className="fixed inset-0 flex items-center justify-center bg-background">
      <div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
    </div>
  );
  if (!pet) return null;

  const latestLog = logs[0];
  const isMemorial = pet.is_memorial;
  const isPrimaryOwner = currentUserId && pet.created_by === currentUserId;
  const hasLinkedCoOwner = petCoOwners.some(c => c.co_owner_user_id);
  const age = computeAge(pet);

  // Scores (0–4 mapped to 0–100)
  const appetiteScore = latestLog?.appetite ? Math.round((appetiteNum[latestLog.appetite] / 4) * 100) : null;
  const energyScore = latestLog?.energy_level ? Math.round((energyNum[latestLog.energy_level] / 4) * 100) : null;
  const vomitScore = latestLog?.vomiting != null ? Math.max(0, 100 - latestLog.vomiting * 25) : null;
  const weightVal = latestLog?.weight_grams ? (latestLog.weight_grams / 1000).toFixed(2) : null;

  const wellnessScore = wellness?.latest?.score ?? null;
  const wellnessStatus = wellnessScore == null ? 'good' : wellnessScore >= 90 ? 'good' : wellnessScore >= 60 ? 'warn' : 'bad';
  const todayStr2 = format(new Date(), 'yyyy-MM-dd');
  const checkedInToday = wellness?.latest?.check_in_date === todayStr2;
  const wellnessExplanation = checkedInToday
    ? explainScore(pet.name, wellnessScore, wellness.latest.score_reason_summary)
    : null;
  const lastUpdatedLabel = wellness?.latest?.check_in_date
    ? format(parseISO(wellness.latest.check_in_date), 'MMM d')
    : pet.updated_at ? format(parseISO(pet.updated_at), 'MMM d') : null;

  const scoreItems = [
    { icon: <Activity className="h-5 w-5 text-white" />, score: wellnessScore, maxScore: 100, label: scoreLabel(wellnessScore) || 'Wellness', status: wellnessStatus, key: 'wellness' },
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
  const weightEntries = chartData.filter(d => d.weight != null);
  const hasWeight = weightEntries.length > 0;
  // No baseline-weight field exists in the data model (pet_onboarding's
  // baseline columns cover health/meds/appetite/water/energy/mobility/
  // bathroom only) — this compares against the last logged entry rather
  // than a true baseline until one is added.
  const weightAlert = weightEntries.length >= 2 && weightEntries[weightEntries.length - 1].weight < weightEntries[weightEntries.length - 2].weight
    ? 'Weight decreased from the last entry'
    : null;

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
            <button onClick={() => navigate(-1)} className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(8px)' }}>
              <ArrowLeft className="h-5 w-5 text-white" />
            </button>

            <div className="flex items-center gap-2">
              <button onClick={() => setCareOpen(true)} className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(8px)' }}>
                <Menu className="h-5 w-5 text-white" />
              </button>
            </div>
          </div>

          {/* Pet info at bottom of hero */}
          <div className="absolute bottom-0 left-0 right-0 px-5 pb-4">
            <h1 className="text-3xl font-bold text-white leading-tight">{pet.name}</h1>
            <p className="text-sm text-white/50 mt-0.5">
              {getPetLabel(pet.species)}{pet.breed ? ` · ${pet.breed}` : ''}{age ? ` · ${age}` : ''}
            </p>
            {pet.conditions?.length > 0 && (
              <p className="text-sm text-white/50 mt-1.5 font-medium">
                {pet.conditions.join(' | ')}
              </p>
            )}
            {!isMemorial && lastUpdatedLabel && (
              <p className="text-xs text-white/35 mt-1">Last updated {lastUpdatedLabel}</p>
            )}
          </div>
        </div>

        {/* ── OURA-STYLE SCORE ROW ── */}
        {!isMemorial && (
          <div className="px-5 pt-5 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
            <div className="flex gap-5 pb-1" style={{ width: 'max-content' }}>
              {scoreItems.map(({ key, ...item }) => (
                <ScoreBubble key={key} {...item} onClick={() => key === 'wellness' ? setCheckInOpen(true) : setLogSheet(key)} />
              ))}
              <Link to={`/pet/${petId}/symptoms`} className="flex flex-col items-center justify-center gap-1.5 flex-shrink-0" style={{ minWidth: 72 }}>
                <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.08)', border: '1.5px solid rgba(255,255,255,0.12)' }}>
                  <ClipboardList className="h-5 w-5 text-white/50" />
                </div>
                <p className="text-[10px] text-white/40 mt-1 uppercase tracking-wide">All logs</p>
              </Link>
            </div>
            {wellnessExplanation && (
              <p className="text-xs text-white/40 mt-3 px-1">{wellnessExplanation}</p>
            )}
          </div>
        )}

        <div className="px-4 pt-5 space-y-4 max-w-2xl mx-auto">

          {/* ── LOG TODAY BUTTON ── */}
          {!isMemorial && (
            <button onClick={() => { track('daily_check_in_started', { pet_id: petId, check_in_date: format(new Date(), 'yyyy-MM-dd') }); setCheckInOpen(true); }}
              className="w-full flex items-center justify-center gap-2 rounded-2xl py-3.5 text-sm font-semibold transition-all active:opacity-70"
              style={{ background: 'rgba(135,206,235,0.12)', border: '1px solid rgba(135,206,235,0.25)', color: '#6EBBE7' }}
            >
              <Plus className="h-4 w-4" /> Daily check-in
            </button>
          )}

          {/* ── 1. PROFILE ── */}
          <SectionCard title="Profile">
            <div className="space-y-1.5 text-sm text-white/60">
              {pet.sex && <p>Sex: <span className="text-white">{pet.sex}</span></p>}
              {pet.altered_status && <p>Altered: <span className="text-white">{pet.altered_status}</span></p>}
              {pet.birth_date && <p>Born: <span className="text-white">{format(parseISO(pet.birth_date), 'MMM d, yyyy')}</span></p>}
              {pet.microchip_number && <p>Microchip: <span className="text-white">{pet.microchip_number}</span></p>}
              {!pet.sex && !pet.altered_status && !pet.birth_date && !pet.microchip_number && (
                <p className="text-white/40">No profile details added yet.</p>
              )}
            </div>
            {/* Not gated by isMemorial — deleting/editing/sharing a memorial
                pet must stay possible, same as it was from Settings.jsx. */}
            <div className="flex items-center gap-2 mt-4">
              <button onClick={() => setEditOpen(true)} className="flex-1 flex items-center justify-center gap-1.5 rounded-xl text-xs font-semibold py-2.5 min-h-[40px]" style={{ background: 'rgba(255,255,255,0.08)', color: '#fff', border: '1px solid rgba(255,255,255,0.12)' }}>
                <Pencil className="h-3.5 w-3.5" /> Edit
              </button>
              <button onClick={() => setCoOwnerOpen(true)} className="flex-1 flex items-center justify-center gap-1.5 rounded-xl text-xs font-semibold py-2.5 min-h-[40px]" style={{ background: 'rgba(255,255,255,0.08)', color: '#fff', border: '1px solid rgba(255,255,255,0.12)' }}>
                <UserPlus className="h-3.5 w-3.5" /> Share
              </button>
              <button
                onClick={openDeletePetFlow}
                disabled={!isOnline}
                className="flex-1 flex items-center justify-center gap-1.5 rounded-xl text-xs font-semibold py-2.5 min-h-[40px] disabled:opacity-40"
                style={{ background: 'rgba(229,115,115,0.12)', color: '#E57373', border: '1px solid rgba(229,115,115,0.25)' }}
              >
                <Trash2 className="h-3.5 w-3.5" /> Delete
              </button>
            </div>
          </SectionCard>

          {/* ── 2. BASELINE ── */}
          {!isMemorial && (
            <SectionCard title="Baseline" to={`/pet/${petId}/profile?tab=baseline`}>
              {onboarding?.completed_at ? (
                <p className="text-sm text-white/60">Baseline set up.</p>
              ) : onboarding ? (
                <p className="text-sm text-white/60 flex items-center gap-1.5"><Sparkles className="h-3.5 w-3.5 text-primary" /> Onboarding is still in progress.</p>
              ) : (
                <p className="text-sm text-white/60">{pet.name}'s baseline hasn't been set up yet.</p>
              )}
            </SectionCard>
          )}

          {/* ── 3. CONDITIONS ── */}
          {!isMemorial && (
            <SectionCard title="Conditions">
              {pet.conditions?.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {pet.conditions.map(c => (
                    <span key={c} className="text-xs px-3 py-1.5 rounded-full" style={{ background: 'rgba(255,255,255,0.08)', color: '#fff' }}>{c}</span>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-white/60">No conditions recorded.</p>
              )}
              <button onClick={() => setEditOpen(true)} className="mt-3 text-xs font-semibold" style={{ color: '#6EBBE7' }}>Manage conditions →</button>
            </SectionCard>
          )}

          {/* ── 4. MEDICATIONS ── */}
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

          {/* ── 5. FOOD ── */}
          {foods.length > 0 && (
            <section>
              <Link to={`/pet/${petId}/food`} className="flex items-center justify-between px-1 mb-3 group">
                <p className="text-xs font-bold uppercase tracking-widest text-white/30">Food</p>
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

          {/* ── 6. VACCINATIONS ── */}
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

          {/* ── 7. WEIGHT ── */}
          {hasWeight && (
            <section className="space-y-3">
              <p className="text-xs font-bold uppercase tracking-widest text-white/30 px-1">Weight</p>
              <OuraChartCard title="Weight (kg)" value={weightVal} valueLabel="kg" to={`/pet/${petId}/symptoms`} alert={weightAlert}>
                <ResponsiveContainer width="100%" height={110}>
                  <LineChart data={chartData} margin={{ left: -20, right: 10, top: 5, bottom: 0 }}>
                    <XAxis dataKey="label" tick={{ fontSize: 9, fill: 'rgba(255,255,255,0.3)' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 9, fill: 'rgba(255,255,255,0.3)' }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={chartTooltipStyle} cursor={{ stroke: 'rgba(255,255,255,0.1)' }} />
                    <Line type="monotone" dataKey="weight" stroke="white" strokeWidth={2} dot={{ fill: 'white', r: 2 }} name="Weight (kg)" connectNulls />
                  </LineChart>
                </ResponsiveContainer>
              </OuraChartCard>
            </section>
          )}

          {/* ── 8. OBSERVATIONS ── */}
          {(hasChartData || logs.length > 0) && (
            <section className="space-y-3 pb-4">
              <Link to={`/pet/${petId}/symptoms`} className="flex items-center justify-between px-1 group">
                <p className="text-xs font-bold uppercase tracking-widest text-white/30">Observations</p>
                <span className="flex items-center gap-0.5 text-xs font-semibold text-white/30 group-hover:text-white/60 transition-colors">
                  View all <ChevronRight className="h-3 w-3" />
                </span>
              </Link>
              {!isMemorial && !checkedInToday && (
                <p className="text-xs px-1" style={{ color: STATUS_COLOR.warn }}>No Daily Check-In completed today</p>
              )}

              {hasChartData && (
                <>
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
                </>
              )}

              {logs.length > 0 && (
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
              )}
            </section>
          )}

          {/* ── 9. TIMELINE ── */}
          <SectionCard title="Timeline" to={`/pet/${petId}/timeline`}>
            <p className="text-sm text-white/60 flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" /> View the complete health story</p>
          </SectionCard>

          {/* ── 10. HEALTH RECORDS ── */}
          <section>
            <div className="flex items-center justify-between px-1 mb-3">
              <p className="text-xs font-bold uppercase tracking-widest text-white/30">Health Records</p>
              {latestBW && <Link to={`/pet/${petId}/profile?tab=bloodwork`} className="text-xs font-semibold" style={{ color: '#6EBBE7' }}>Manage →</Link>}
            </div>
            <div className="rounded-2xl overflow-hidden" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
              {latestBW && bwFields.length > 0 && (
                <Link to={`/pet/${petId}/profile?tab=bloodwork`} className="block">
                  {bwFields.map(f => {
                    const s = getBloodStatus(f.key, latestBW[f.key]);
                    return (
                      <div key={f.key} className="flex items-center gap-3 px-4 py-3 border-b border-white/5">
                        <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: STATUS_COLOR[s] || '#00D4AA' }} />
                        <p className="flex-1 text-sm text-white">{f.label}</p>
                        <span className="text-sm font-bold text-white mr-1">{latestBW[f.key]}</span>
                        <span className="text-xs text-white/30 mr-2">{f.unit}</span>
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${BADGE[s]}`}>{s === 'good' ? 'Normal' : s === 'warn' ? 'Elevated' : 'High'}</span>
                      </div>
                    );
                  })}
                </Link>
              )}
              <Link to={`/pet/${petId}/documents`} className="flex items-center gap-3 px-4 py-3.5 border-b border-white/5">
                <Folder className="h-4 w-4 text-white/40 flex-shrink-0" />
                <span className="flex-1 text-sm text-white">Documents</span>
                <ChevronRight className="h-4 w-4 text-white/25" />
              </Link>
              <Link to={`/pet/${petId}/export`} className="flex items-center gap-3 px-4 py-3.5">
                <FileText className="h-4 w-4 text-white/40 flex-shrink-0" />
                <span className="flex-1 text-sm text-white">Export for Vet</span>
                <ChevronRight className="h-4 w-4 text-white/25" />
              </Link>
            </div>
          </section>

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

        {checkInOpen && (
          <DailyCheckInSheet
            pet={pet}
            date={format(new Date(), 'yyyy-MM-dd')}
            onClose={() => setCheckInOpen(false)}
            onSaved={() => { setCheckInOpen(false); loadData(); }}
          />
        )}

        <EditPetSheet pet={pet} open={editOpen} onOpenChange={setEditOpen} onSuccess={() => { setEditOpen(false); loadData(); }} />
        <InviteCoOwnerDialog petId={petId} petName={pet.name} open={coOwnerOpen} onOpenChange={setCoOwnerOpen} />

        {/* Delete Pet — Step 1: Warning */}
        <Dialog open={deletePetStep === 1} onOpenChange={(v) => !v && closeDeletePetFlow()}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="font-serif text-xl text-destructive">Delete {pet.name}?</DialogTitle>
            </DialogHeader>
            <DialogDescription asChild>
              <div className="space-y-3 text-sm text-muted-foreground">
                {isPrimaryOwner && hasLinkedCoOwner ? (
                  <>
                    <p>
                      You share {pet.name} with a co-owner. Removing {pet.name} from your account will
                      transfer full ownership to your co-owner — you'll no longer have access to their profile,
                      logs, medications, records, or photos.
                    </p>
                    <p>Your co-owner will keep {pet.name} and all of their health history.</p>
                  </>
                ) : !isPrimaryOwner ? (
                  <p>
                    You'll be removed as a co-owner of {pet.name}. The primary owner keeps full access and
                    all of {pet.name}'s health history.
                  </p>
                ) : (
                  <p>
                    This will permanently delete {pet.name} and all information connected to them, including
                    logs, medications, records, photos, and reports.
                  </p>
                )}
                <p>This will not delete your Wysker Watch account or any other pets.</p>
                <p className="font-medium text-foreground">This cannot be undone.</p>
              </div>
            </DialogDescription>
            <DialogFooter className="mt-2 gap-2">
              <button onClick={closeDeletePetFlow} className="flex-1 h-10 rounded-lg border border-border text-sm font-medium hover:bg-secondary transition-colors">Cancel</button>
              <button
                onClick={() => setDeletePetStep(2)}
                className="flex-1 h-10 rounded-lg bg-destructive text-destructive-foreground text-sm font-medium hover:bg-destructive/90 transition-colors"
              >
                Continue
              </button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Pet — Step 2: Type pet name to confirm */}
        <Dialog open={deletePetStep === 2} onOpenChange={(v) => !v && closeDeletePetFlow()}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="font-serif text-xl text-destructive">Confirm Deletion</DialogTitle>
            </DialogHeader>
            <DialogDescription asChild>
              <div className="space-y-3 text-sm text-muted-foreground">
                <p>Type <strong className="text-foreground font-mono">{pet.name}</strong> to confirm.</p>
              </div>
            </DialogDescription>
            <Input
              value={deletePetConfirmText}
              onChange={e => setDeletePetConfirmText(e.target.value)}
              placeholder={pet.name}
              className="font-mono"
              autoCapitalize="none"
              autoCorrect="off"
              disabled={deletingPet}
            />
            {deletePetError && <p className="text-sm text-destructive">{deletePetError}</p>}
            <DialogFooter className="mt-2 gap-2">
              <button onClick={closeDeletePetFlow} disabled={deletingPet} className="flex-1 h-10 rounded-lg border border-border text-sm font-medium hover:bg-secondary transition-colors disabled:opacity-50">Cancel</button>
              <button
                onClick={handleDeletePet}
                disabled={deletePetConfirmText !== pet.name || deletingPet || !isOnline}
                className="flex-1 h-10 rounded-lg bg-destructive text-destructive-foreground text-sm font-medium hover:bg-destructive/90 transition-colors disabled:opacity-40"
              >
                {deletingPet ? 'Deleting…' : 'Delete Pet'}
              </button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </PageTransition>
  );
}
