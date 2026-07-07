import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { entities } from '@/api/entities';
import { supabase } from '@/api/supabaseClient';
import {
  ChevronRight, ChevronDown, Share2, Pencil, Trash2, Rainbow,
  Cat, Dog, Activity, UtensilsCrossed, Zap, Heart, Scale, HeartPulse, ClipboardList,
  Pill, Utensils, ShieldCheck, TrendingUp, Calendar, Clock, FileText, Droplets, Footprints, Loader2,
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import EditPetSheet from './EditPetSheet';
import MemorialDialog from './MemorialDialog';
import DailyCheckInModal from './DailyCheckInModal';
import { track } from '@/lib/analytics';
import { getLatestWellness, getObservationValuesForCheckIns, getCheckIn } from '@/lib/checkin/checkinClient';
import { getChipState } from '@/lib/checkin/chipLabels';
import {
  getWellnessRingScores, getWeightSummary, getVaccinationSummary, getTimelineEvents, getHealthRecordsCount,
} from '@/lib/checkin/petProfileClient';
import { getPetLabel } from '@/lib/speciesConfig';
import { computeDetailedAge } from '@/lib/lifeStage';
import { PALETTE, RING_COLOR } from '@/lib/toneColors';

const STATUS_TONE = { Stable: 'good', Improving: 'good', Lower: 'warn', Monitor: 'warn' };

const todayStr = () => new Date().toISOString().split('T')[0];

// Fixed Observations chip slots (Feature Spec §9) — labels/state come from
// the shared chipLabels module so this screen and the Pets screen's
// PetCard never describe the same observation two different ways.
const OBSERVATION_SLOTS = [
  { code: 'appetite', label: 'Appetite', icon: UtensilsCrossed },
  { code: 'water_intake', label: 'Water', icon: Droplets },
  { code: 'energy', label: 'Energy', icon: Zap },
  { code: 'stool', label: 'Stool', icon: HeartPulse },
  { code: 'mobility', label: 'Activity', icon: Footprints },
];

// Oura-style circular indicator shared by all five Wellness Summary rings.
// Rendered inside a <button> by the caller — every ring is tappable,
// consistently (Wellness/Appetite/Energy/Symptoms open Daily Check-In,
// Weight opens the weight quick-log sheet), so there's no dead-looking
// ring next to a live one.
function WellnessRing({ icon: Icon, score, maxScore, label, statusLabel }) {
  const tone = statusLabel ? (STATUS_TONE[statusLabel] || 'unknown') : 'unknown';
  const color = RING_COLOR[tone];
  return (
    <div className="flex flex-col items-center gap-1.5 flex-shrink-0" style={{ minWidth: 64 }}>
      <div className="relative w-16 h-16 rounded-full flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.06)' }}>
        <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 64 64">
          <circle cx="32" cy="32" r="28" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="4" />
          {score != null && (
            <circle cx="32" cy="32" r="28" fill="none" stroke={color} strokeWidth="4"
              strokeDasharray={`${(Math.min(score, maxScore) / maxScore) * 175.9} 175.9`}
              strokeLinecap="round" />
          )}
        </svg>
        <Icon className="absolute h-4 w-4 text-white/25" style={{ top: 6 }} aria-hidden="true" />
        <span className="text-[17px] font-bold text-white">{score != null ? score : '—'}</span>
      </div>
      <p className="text-[13px] font-medium text-white/50">{label}</p>
      <p className="text-[13px] font-semibold" style={{ color: statusLabel ? color : 'rgba(255,255,255,0.35)' }}>
        {statusLabel || 'No Data'}
      </p>
    </div>
  );
}

// Summary card shared by Baseline/Conditions/Medications/Food/Vaccinations/
// Weight/Observations/Timeline/Health Records — icon + title + subtitle +
// summary value + chevron, linking into the existing feature that owns
// the detail (Feature Spec UI Components: "Navigation Cards").
function NavCard({ icon: Icon, iconBg, iconColor, title, subtitle, value, valueColor, to, onClick, error, children }) {
  const content = (
    <div className="rounded-2xl px-4 py-4" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
      <div className="flex items-center gap-3.5">
        <div className="h-11 w-11 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: iconBg }}>
          <Icon className="h-5 w-5" style={{ color: iconColor }} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[16px] font-semibold text-white truncate">{title}</p>
          <p className="text-[13px] text-white/40 truncate">
            {error ? 'Unable to load' : subtitle}
          </p>
        </div>
        {!error && value != null && (
          <span className="text-base font-semibold flex-shrink-0" style={{ color: valueColor || '#fff' }}>{value}</span>
        )}
        {(to || onClick) && <ChevronRight className="h-4 w-4 text-white/25 flex-shrink-0" />}
      </div>
      {children}
    </div>
  );
  if (to) return <Link to={to} className="block active:scale-[0.99] transition-transform">{content}</Link>;
  if (onClick) return <button onClick={onClick} className="block w-full text-left active:scale-[0.99] transition-transform">{content}</button>;
  return content;
}

function Sparkline({ points, color = PALETTE.sky }) {
  if (points.length < 2) return null;
  const w = 100, h = 32;
  const values = points.map((p) => p.lbs);
  const min = Math.min(...values), max = Math.max(...values);
  const range = max - min || 1;
  const path = points.map((p, i) => {
    const x = (i / (points.length - 1)) * w;
    const y = h - ((p.lbs - min) / range) * h;
    return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  const last = points[points.length - 1];
  const lastY = h - ((last.lbs - min) / range) * h;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-24 h-8 flex-shrink-0" preserveAspectRatio="none">
      <path d={path} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" />
      <circle cx={w} cy={lastY} r="2.5" fill={color} />
    </svg>
  );
}

// Flat placeholder chart for the Weight card's empty state (Feature Spec
// Empty States: "No weight history. Display placeholder chart.").
function WeightPlaceholderChart() {
  return (
    <svg viewBox="0 0 100 32" className="w-24 h-8 flex-shrink-0" preserveAspectRatio="none">
      <line x1="0" y1="16" x2="100" y2="16" stroke="rgba(255,255,255,0.15)" strokeWidth="2" strokeDasharray="4 4" />
    </svg>
  );
}

// Minimal single-field weight log sheet — weight is the only ring metric
// still sourced from symptom_logs (Data Model §3.8), so tapping the
// Weight ring writes there directly instead of opening the full Daily
// Check-In flow.
function WeightQuickLogSheet({ petId, onClose, onSaved }) {
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);
  const today = todayStr();

  const save = async () => {
    const lbs = parseFloat(value);
    if (!Number.isFinite(lbs) || lbs <= 0) return;
    setSaving(true);
    const grams = Math.round(lbs * 453.59237);
    const existing = await entities.SymptomLog.filter({ pet_id: petId, date: today });
    if (existing.length) {
      await entities.SymptomLog.update(existing[0].id, { weight_grams: grams });
    } else {
      await entities.SymptomLog.create({ pet_id: petId, date: today, weight_grams: grams });
    }
    setSaving(false);
    onSaved();
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div className="relative rounded-t-3xl px-5 pt-5 pb-10 shadow-2xl" style={{ background: 'rgba(18,20,32,0.98)', border: '1px solid rgba(255,255,255,0.08)' }} onClick={(e) => e.stopPropagation()}>
        <div className="w-10 h-1 bg-white/20 rounded-full mx-auto mb-5" />
        <h3 className="text-2xl font-bold text-white mb-1">Log Weight</h3>
        <p className="text-sm text-white/40 mb-5">Today · {format(new Date(), 'MMM d')}</p>
        <input
          type="number" step="0.1" placeholder="e.g. 9.8" inputMode="decimal" aria-label="Weight in pounds"
          value={value} onChange={(e) => setValue(e.target.value)}
          className="w-full rounded-2xl px-4 py-3 text-xl text-center font-bold text-white focus:outline-none focus:ring-1 focus:ring-primary border border-white/10 mb-2"
          style={{ background: 'rgba(255,255,255,0.08)' }}
        />
        <p className="text-sm text-center text-white/30 mb-5">pounds</p>
        <button onClick={save} disabled={!value || saving}
          className="w-full text-base font-bold rounded-2xl h-14 disabled:opacity-30 transition-opacity flex items-center justify-center gap-2"
          style={{ background: PALETTE.sky, color: '#0D0F1A' }}
        >{saving ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Save'}</button>
      </div>
    </div>
  );
}

function ExpandToggle({ expanded, onToggleExpanded }) {
  if (!onToggleExpanded) return null;
  return (
    <button
      type="button"
      onClick={onToggleExpanded}
      aria-expanded={expanded}
      className="w-full flex items-center justify-center gap-1.5 py-2 min-h-[44px] text-[13px] font-semibold text-white/60"
    >
      {expanded ? 'Show less' : 'Show more'}
      <ChevronDown className={`h-4 w-4 transition-transform ${expanded ? 'rotate-180' : ''}`} aria-hidden="true" />
    </button>
  );
}

function ActionPill({ icon: Icon, label, onClick, danger, disabled }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="flex items-center gap-1.5 rounded-full px-3.5 h-10 text-[13px] font-semibold flex-shrink-0 disabled:opacity-40 transition-opacity active:opacity-70"
      style={{
        background: danger ? 'rgba(229,115,115,0.12)' : 'rgba(255,255,255,0.06)',
        color: danger ? PALETTE.red : '#fff',
        border: `1px solid ${danger ? 'rgba(229,115,115,0.3)' : 'rgba(255,255,255,0.1)'}`,
      }}
    >
      <Icon className="h-4 w-4" aria-hidden="true" /> {label}
    </button>
  );
}

// Full Pet Profile content: wellness summary + navigation cards + pet-level
// actions (Edit/Move to Rainbow Bridge/Delete). Extracted so both the
// standalone `/pet/:petId` route (PetProfile.jsx) and the expandable Pets-
// tab card (ExpandablePetProfileCard) render the exact same data-loading
// and business logic instead of keeping two copies in sync.
export default function PetProfileContent({ petId, onReload, expanded = true, onToggleExpanded }) {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [pet, setPet] = useState(null);
  const [petError, setPetError] = useState(false);
  const [headerLoading, setHeaderLoading] = useState(true);
  const [detailsLoading, setDetailsLoading] = useState(true);

  const [wellness, setWellness] = useState(null);
  const [ringScores, setRingScores] = useState({ appetite: {}, energy: {}, symptoms: {} });
  const [weightSummary, setWeightSummary] = useState(null);
  const [medications, setMedications] = useState([]);
  const [foods, setFoods] = useState([]);
  const [vaccinations, setVaccinations] = useState([]);
  const [onboarding, setOnboarding] = useState(null);
  const [timelineCount, setTimelineCount] = useState(null);
  const [healthRecordsCount, setHealthRecordsCount] = useState(null);
  const [todayCheckIn, setTodayCheckIn] = useState(null);
  const [todayObservationValues, setTodayObservationValues] = useState({});
  const [petCoOwners, setPetCoOwners] = useState([]);
  const [currentUserId, setCurrentUserId] = useState(null);
  const [errors, setErrors] = useState({});
  const [fullDetailsLoading, setFullDetailsLoading] = useState(false);
  const [fullDetailsLoaded, setFullDetailsLoaded] = useState(false);

  const [checkInOpen, setCheckInOpen] = useState(false);
  const [weightLogOpen, setWeightLogOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [memorialOpen, setMemorialOpen] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [deletePetStep, setDeletePetStep] = useState(0);
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

  // Split so the Pets-tab collapsed card — which only shows identity + the
  // wellness-ring circles — doesn't pay for the Baseline/Medications/Food/
  // Vaccinations/Timeline/Health-Records batch until the card is actually
  // expanded. `loadSummary` covers everything the collapsed view (and the
  // Daily Check-In modal's `existingCheckIn`) needs; `loadFullDetails`
  // covers only what the expanded nav cards render.
  const loadSummary = useCallback(async () => {
    setDetailsLoading(true);
    let petData;
    try {
      petData = await entities.Pet.get(petId);
      setPet(petData);
      setPetError(false);
    } catch (err) {
      console.error(err);
      setPetError(true);
      setHeaderLoading(false);
      setDetailsLoading(false);
      return;
    }
    setHeaderLoading(false);

    if (petData.is_memorial) {
      setDetailsLoading(false);
      return;
    }

    const [wellnessR, ringScoresR, weightR, checkInR] = await Promise.allSettled([
      getLatestWellness(petId),
      getWellnessRingScores(petId),
      getWeightSummary(petId),
      getCheckIn(petId, todayStr()),
    ]);

    const nextErrors = {};

    setWellness(wellnessR.status === 'fulfilled' ? wellnessR.value : null);
    if (wellnessR.status === 'rejected') { console.error(wellnessR.reason); nextErrors.wellness = true; }

    if (ringScoresR.status === 'fulfilled') {
      setRingScores(ringScoresR.value);
    } else {
      console.error(ringScoresR.reason);
      setRingScores({ appetite: {}, energy: {}, symptoms: {} });
      nextErrors.wellness = true;
    }

    setWeightSummary(weightR.status === 'fulfilled' ? weightR.value : null);
    if (weightR.status === 'rejected') { console.error(weightR.reason); nextErrors.weight = true; }

    setTodayCheckIn(checkInR.status === 'fulfilled' ? checkInR.value : null);
    if (checkInR.status === 'rejected') { console.error(checkInR.reason); nextErrors.observations = true; }

    setErrors((prev) => ({ ...prev, ...nextErrors }));
    setDetailsLoading(false);
  }, [petId]);

  const loadFullDetails = useCallback(async () => {
    setFullDetailsLoading(true);

    entities.PetCoOwner.filter({ pet_id: petId }).then(setPetCoOwners).catch(() => setPetCoOwners([]));

    const results = await Promise.allSettled([
      entities.Medication.filter({ pet_id: petId, active: true }, '-start_date', 50),
      entities.PetFood.filter({ pet_id: petId, active: true }),
      entities.Vaccination.filter({ pet_id: petId }, '-date_given', 50),
      entities.PetOnboarding.filter({ pet_id: petId }),
      getTimelineEvents(petId),
      getHealthRecordsCount(petId),
      getCheckIn(petId, todayStr()),
    ]);

    const [medsR, foodsR, vaxR, onboardingR, timelineR, healthRecordsR, checkInR] = results;

    const nextErrors = {};

    setMedications(medsR.status === 'fulfilled' ? medsR.value : []);
    if (medsR.status === 'rejected') { console.error(medsR.reason); nextErrors.medications = true; }

    const todayStrVal = todayStr();
    setFoods(foodsR.status === 'fulfilled' ? foodsR.value.filter((f) => f.active && (!f.end_date || f.end_date >= todayStrVal)) : []);
    if (foodsR.status === 'rejected') { console.error(foodsR.reason); nextErrors.food = true; }

    setVaccinations(vaxR.status === 'fulfilled' ? vaxR.value : []);
    if (vaxR.status === 'rejected') { console.error(vaxR.reason); nextErrors.vaccinations = true; }

    setOnboarding(onboardingR.status === 'fulfilled' ? (onboardingR.value[0] || null) : null);
    if (onboardingR.status === 'rejected') { console.error(onboardingR.reason); nextErrors.baseline = true; }

    setTimelineCount(timelineR.status === 'fulfilled' ? timelineR.value.length : null);
    if (timelineR.status === 'rejected') { console.error(timelineR.reason); nextErrors.timeline = true; }

    setHealthRecordsCount(healthRecordsR.status === 'fulfilled' ? healthRecordsR.value : null);
    if (healthRecordsR.status === 'rejected') { console.error(healthRecordsR.reason); nextErrors.healthRecords = true; }

    const todayRow = checkInR.status === 'fulfilled' ? checkInR.value : null;
    if (checkInR.status === 'rejected') {
      console.error(checkInR.reason);
      nextErrors.observations = true;
      setTodayObservationValues({});
    } else {
      try {
        const values = await getObservationValuesForCheckIns({ [petId]: todayRow });
        setTodayObservationValues(values[petId] || {});
      } catch (err) {
        console.error(err);
        nextErrors.observations = true;
        setTodayObservationValues({});
      }
    }

    setErrors((prev) => ({ ...prev, ...nextErrors }));
    setFullDetailsLoading(false);
    setFullDetailsLoaded(true);
  }, [petId]);

  // Reloads whatever this instance currently has loaded — used for pull-
  // to-refresh and after a save (check-in/edit/memorial/weight) so an
  // already-expanded card's nav cards stay in sync too.
  const reloadAll = useCallback(async () => {
    await loadSummary();
    if (expanded || fullDetailsLoaded) await loadFullDetails();
  }, [loadSummary, loadFullDetails, expanded, fullDetailsLoaded]);

  useEffect(() => { loadSummary(); }, [loadSummary]);

  useEffect(() => {
    if (expanded && !fullDetailsLoaded && pet && !pet.is_memorial) loadFullDetails();
  }, [expanded, fullDetailsLoaded, pet, loadFullDetails]);

  useEffect(() => { onReload?.(reloadAll); }, [onReload, reloadAll]);

  useEffect(() => {
    if (searchParams.get('startCheckin') === '1') {
      track('daily_check_in_started', { pet_id: petId, check_in_date: todayStr() });
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

  const [shareFeedback, setShareFeedback] = useState('');
  const handleShare = async () => {
    if (!pet) return;
    const age = computeDetailedAge(pet);
    const text = `${pet.name} — ${getPetLabel(pet.species)}${pet.breed ? ` · ${pet.breed}` : ''}${age ? ` · ${age}` : ''}${pet.conditions?.length ? `\nConditions: ${pet.conditions.join(', ')}` : ''}`;
    if (navigator.share) {
      try { await navigator.share({ title: `${pet.name}'s Wysker Watch Profile`, text }); } catch { /* user cancelled */ }
    } else {
      try {
        await navigator.clipboard.writeText(text);
        setShareFeedback('Copied to clipboard');
      } catch {
        setShareFeedback('Unable to share');
      }
      setTimeout(() => setShareFeedback(''), 2500);
    }
    track('pet_profile_shared', { pet_id: petId });
  };

  if (petError) {
    return (
      <div className="flex flex-col items-center justify-center px-6 text-center gap-4 py-16">
        <p className="text-white/60">Unable to load profile.</p>
        <button onClick={loadSummary} className="rounded-xl px-4 py-2 text-sm font-semibold" style={{ background: PALETTE.sky, color: '#0D0F1A' }}>Retry</button>
      </div>
    );
  }

  if (headerLoading || !pet) return <PetProfileDetailsSkeleton />;

  const isMemorial = pet.is_memorial;
  const isPrimaryOwner = currentUserId && pet.created_by === currentUserId;
  const hasLinkedCoOwner = petCoOwners.some((c) => c.co_owner_user_id);
  const age = computeDetailedAge(pet);
  const checkedInToday = todayCheckIn?.check_in_date === todayStr();

  const wellnessScore = wellness?.latest?.check_in_date === todayStr() ? wellness.latest.score : null;
  const wellnessStatus = wellness?.latest?.check_in_date === todayStr()
    ? { stable: 'Stable', improving: 'Improving', monitor: 'Monitor', declining: 'Lower', unknown: null }[wellness.trend]
    : null;
  const lastUpdated = wellness?.latest
    ? (wellness.latest.check_in_date === todayStr()
        ? `Today at ${format(parseISO(wellness.latest.created_at || new Date().toISOString()), 'h:mm a')}`
        : format(parseISO(wellness.latest.check_in_date), 'MMM d'))
    : pet.updated_at ? format(parseISO(pet.updated_at), 'MMM d') : null;

  const vaxSummary = getVaccinationSummary(vaccinations);
  const weightValLbs = weightSummary?.currentLbs != null ? weightSummary.currentLbs.toFixed(1) : null;
  const weightDeltaLbs = weightSummary?.deltaLbs;

  const baselineState = onboarding?.completed_at ? 'complete' : onboarding ? 'in_progress' : 'not_started';
  const baselineSubtitle = {
    complete: `${pet.name}'s normal behaviors and daily routine`,
    in_progress: 'Onboarding is still in progress.',
    not_started: "Set up your pet's baseline.",
  }[baselineState];
  const baselineValue = { complete: 'Set Up', in_progress: 'In Progress', not_started: 'Set Up' }[baselineState];

  const conditionsCount = pet.conditions?.length || 0;
  const medicationsCount = medications.length;
  const foodsCount = foods.length;

  const showDetails = expanded && !detailsLoading && !fullDetailsLoading;
  const showDetailsSkeleton = expanded && !detailsLoading && fullDetailsLoading && !isMemorial;

  return (
    <div>
      {/* ── IDENTITY ── */}
      <div className="flex flex-col items-center px-1 pt-2 pb-1 text-center">
        <div className="h-24 w-24 rounded-full overflow-hidden flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.06)', border: '2px solid rgba(255,255,255,0.1)' }}>
          {pet.photo_url ? (
            <img src={pet.photo_url} alt={pet.name} className={`w-full h-full object-cover ${isMemorial ? 'grayscale' : ''}`} />
          ) : pet.species === 'Dog' ? (
            <Dog className="h-10 w-10 text-white/40" />
          ) : (
            <Cat className="h-10 w-10 text-white/40" />
          )}
        </div>
        <h2 className="text-[28px] font-bold text-white mt-3 leading-tight">{pet.name}</h2>
        <p className="text-[14px] text-white/45 mt-0.5">
          {getPetLabel(pet.species)}{pet.breed ? ` · ${pet.breed}` : ''}{pet.sex ? ` · ${pet.sex}` : ''}
        </p>
        {age && <p className="text-[14px] text-white/45">{age}</p>}

        {pet.conditions?.length > 0 && (
          <div className="flex flex-wrap justify-center gap-2 mt-3">
            {pet.conditions.map((c) => (
              <span key={c} className="inline-flex items-center gap-1.5 text-[13px] font-medium px-3 py-1.5 rounded-full" style={{ background: 'rgba(244,199,107,0.12)', border: '1px solid rgba(244,199,107,0.3)', color: PALETTE.amber }}>
                <ShieldCheck className="h-3.5 w-3.5" /> {c}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="pt-4 space-y-4">

        {isMemorial ? (
          <>
            <div className="py-8 text-center flex flex-col items-center">
              <Rainbow className="h-8 w-8 mb-2 text-purple-300" />
              <p className="text-base font-semibold text-purple-300">Forever in our hearts</p>
              {pet.memorial_date && <p className="text-sm text-purple-400/60 mt-1">{format(parseISO(pet.memorial_date), 'MMMM d, yyyy')}</p>}
            </div>
            <ExpandToggle expanded={expanded} onToggleExpanded={onToggleExpanded} />
          </>
        ) : detailsLoading ? (
          <PetProfileDetailsSkeleton />
        ) : (
          <>
            {/* ── WELLNESS SUMMARY ── */}
            {/* Always visible — this and the identity block above are the
                Pets-tab card's collapsed state (Nav + Daily Check-In UX
                Refresh spec #6: "Collapse info after the top circles").
                Everything below (actions + nav cards) only renders when
                expanded. */}
            <div className="rounded-2xl px-4 pt-5 pb-4" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
              {errors.wellness ? (
                <p className="text-base text-white/40 text-center py-4">Unable to load wellness summary.</p>
              ) : (
                <div className="flex items-start justify-between gap-1">
                  <button onClick={() => setCheckInOpen(true)} aria-label="Open Daily Check-In">
                    <WellnessRing icon={Activity} score={wellnessScore} maxScore={100} label="Wellness" statusLabel={wellnessStatus} />
                  </button>
                  <button onClick={() => setCheckInOpen(true)} aria-label="Open Daily Check-In">
                    <WellnessRing icon={UtensilsCrossed} score={ringScores.appetite.score} maxScore={100} label="Appetite" statusLabel={ringScores.appetite.statusLabel} />
                  </button>
                  <button onClick={() => setCheckInOpen(true)} aria-label="Open Daily Check-In">
                    <WellnessRing icon={Zap} score={ringScores.energy.score} maxScore={100} label="Energy" statusLabel={ringScores.energy.statusLabel} />
                  </button>
                  <button onClick={() => setCheckInOpen(true)} aria-label="Open Daily Check-In">
                    <WellnessRing icon={Heart} score={ringScores.symptoms.score} maxScore={100} label="Symptoms" statusLabel={ringScores.symptoms.statusLabel} />
                  </button>
                  <button onClick={() => setWeightLogOpen(true)} aria-label="Log weight">
                    <WellnessRing icon={Scale} score={weightSummary?.score} maxScore={100} label="Weight" statusLabel={weightSummary?.statusLabel} />
                  </button>
                </div>
              )}
              <div className="flex items-center gap-1.5 mt-4 pt-3" style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}>
                <Calendar className="h-3.5 w-3.5 text-white/30" />
                <p className="text-[13px] text-white/35">
                  {lastUpdated ? `Last updated ${lastUpdated}` : 'No wellness data yet'}
                </p>
              </div>
            </div>

            <ExpandToggle expanded={expanded} onToggleExpanded={onToggleExpanded} />
          </>
        )}

        {showDetailsSkeleton && <PetProfileDetailsSkeleton />}

        {showDetails && isMemorial && (
          <div className="flex items-center gap-2 flex-wrap justify-center">
            <ActionPill icon={Share2} label="Share" onClick={handleShare} />
            <ActionPill icon={Pencil} label="Edit Pet" onClick={() => setEditOpen(true)} />
            <ActionPill icon={Trash2} label="Delete Pet" danger onClick={openDeletePetFlow} disabled={!isOnline} />
            {shareFeedback && (
              <p role="status" className="text-center text-sm text-white/50 w-full">{shareFeedback}</p>
            )}
          </div>
        )}

        {showDetails && !isMemorial && (
          <>
            {/* ── ACTIONS ── */}
            <div className="flex items-center gap-2 flex-wrap justify-center">
              <ActionPill icon={Share2} label="Share" onClick={handleShare} />
              <ActionPill icon={Pencil} label="Edit Pet" onClick={() => setEditOpen(true)} />
              <ActionPill icon={Rainbow} label="Rainbow Bridge" onClick={() => setMemorialOpen(true)} />
              <ActionPill icon={Trash2} label="Delete Pet" danger onClick={openDeletePetFlow} disabled={!isOnline} />
            </div>
            {shareFeedback && (
              <p role="status" className="text-center text-sm text-white/50">{shareFeedback}</p>
            )}

            {/* ── BASELINE ── */}
            <NavCard
              icon={HeartPulse} iconBg="rgba(76,199,176,0.15)" iconColor={PALETTE.teal}
              title="Baseline" subtitle={baselineSubtitle}
              value={baselineValue} valueColor={baselineState === 'complete' ? PALETTE.teal : PALETTE.amber}
              to={`/pet/${petId}/profile?tab=baseline`} error={errors.baseline}
            />

            {/* ── CONDITIONS ── */}
            {/* No dedicated Condition Management screen exists yet — conditions
                are edited via the Edit Pet sheet's condition chips. */}
            <NavCard
              icon={ClipboardList} iconBg="rgba(244,199,107,0.15)" iconColor={PALETTE.amber}
              title="Conditions" subtitle={conditionsCount > 0 ? 'Chronic conditions and diagnoses' : 'No conditions added.'}
              value={conditionsCount > 0 ? conditionsCount : 'Add Condition'}
              valueColor={conditionsCount > 0 ? '#fff' : PALETTE.amber}
              onClick={() => setEditOpen(true)}
            />

            {/* ── MEDICATIONS ── */}
            <NavCard
              icon={Pill} iconBg="rgba(111,183,255,0.15)" iconColor={PALETTE.sky}
              title="Medications" subtitle={medicationsCount > 0 ? `${medicationsCount} active medication${medicationsCount === 1 ? '' : 's'}` : 'No medications.'}
              value={medicationsCount > 0 ? medicationsCount : 'Add Medication'}
              valueColor={medicationsCount > 0 ? '#fff' : PALETTE.sky}
              to={`/pet/${petId}/profile?tab=medications`} error={errors.medications}
            />

            {/* ── FOOD ── */}
            <NavCard
              icon={Utensils} iconBg="rgba(76,199,176,0.15)" iconColor={PALETTE.teal}
              title="Food" subtitle={foodsCount > 0 ? `${foodsCount} active food${foodsCount === 1 ? '' : 's'}` : 'No food configured.'}
              value={foodsCount > 0 ? foodsCount : 'Add Food'}
              valueColor={foodsCount > 0 ? '#fff' : PALETTE.teal}
              to={`/pet/${petId}/food`} error={errors.food}
            />

            {/* ── VACCINATIONS ── */}
            <NavCard
              icon={ShieldCheck} iconBg="rgba(111,183,255,0.15)" iconColor={PALETTE.sky}
              title="Vaccinations" subtitle={vaxSummary.total === 0 ? 'No vaccinations recorded.' : vaxSummary.isOverdue ? 'Overdue' : 'Up to date'}
              value={vaxSummary.total === 0 ? 'Add Vaccination' : `${vaxSummary.current} / ${vaxSummary.total}`}
              valueColor={vaxSummary.total === 0 ? PALETTE.sky : vaxSummary.isOverdue ? PALETTE.red : PALETTE.sky}
              to={`/pet/${petId}/profile?tab=vaccines`} error={errors.vaccinations}
            />

            {/* ── WEIGHT ── */}
            <NavCard
              icon={Scale} iconBg="rgba(169,174,181,0.15)" iconColor={PALETTE.gray}
              title="Weight"
              subtitle={weightValLbs
                ? `${weightValLbs} lbs${weightDeltaLbs != null ? ` · ${weightDeltaLbs < 0 ? 'Down' : weightDeltaLbs > 0 ? 'Up' : 'Steady at'} ${Math.abs(weightDeltaLbs).toFixed(1)} lbs` : ''}`
                : 'No weight history.'}
              value={weightValLbs ? null : 'Record Weight'} valueColor={PALETTE.sky}
              to={`/pet/${petId}/symptoms`} error={errors.weight}
            >
              <div className="flex justify-end mt-1">
                {weightSummary?.sparkline?.length >= 2 ? <Sparkline points={weightSummary.sparkline} /> : <WeightPlaceholderChart />}
              </div>
            </NavCard>

            {/* ── OBSERVATIONS ── */}
            {checkedInToday ? (
              <NavCard
                icon={TrendingUp} iconBg="rgba(244,199,107,0.15)" iconColor={PALETTE.amber}
                title="Observations" subtitle="Trends and recent observations"
                value="Today" valueColor={PALETTE.amber}
                to={`/pet/${petId}/symptoms`} error={errors.observations}
              >
                <div className="grid grid-cols-5 gap-1.5 mt-3">
                  {OBSERVATION_SLOTS.map(({ code, label, icon: Icon }) => {
                    const { label: value, tone } = getChipState(code, todayCheckIn?.status, todayObservationValues);
                    return (
                      <div key={code} className="rounded-xl px-1.5 py-2 flex flex-col items-center gap-1 text-center" style={{ background: 'rgba(255,255,255,0.04)' }}>
                        <Icon className="h-3.5 w-3.5 text-white/40" />
                        <p className="text-[13px] text-white/40 truncate w-full">{label}</p>
                        <p className="text-[13px] font-semibold truncate w-full" style={{ color: RING_COLOR[tone] }}>{value}</p>
                      </div>
                    );
                  })}
                </div>
              </NavCard>
            ) : (
              <NavCard
                icon={TrendingUp} iconBg="rgba(244,199,107,0.15)" iconColor={PALETTE.amber}
                title="Observations" subtitle="No observations yet."
                value="Start Daily Check-In" valueColor={PALETTE.amber}
                onClick={() => setCheckInOpen(true)} error={errors.observations}
              />
            )}

            {/* ── TIMELINE ── */}
            <NavCard
              icon={Clock} iconBg="rgba(169,174,181,0.15)" iconColor={PALETTE.gray}
              title="Timeline" subtitle={timelineCount ? 'Complete health history' : "Events will appear as your pet's health history grows."}
              value={timelineCount ? `${timelineCount} Event${timelineCount === 1 ? '' : 's'}` : null}
              valueColor={PALETTE.gray} to={`/pet/${petId}/timeline`} error={errors.timeline}
            />

            {/* ── HEALTH RECORDS ── */}
            {/* Links to the existing Bloodwork tab (real data the count is
                derived from) rather than the unrelated Documents placeholder,
                so the number shown here always matches what's on the other side. */}
            <NavCard
              icon={FileText} iconBg="rgba(111,183,255,0.15)" iconColor={PALETTE.sky}
              title="Health Records" subtitle={healthRecordsCount ? 'Lab results, vet visits, and documents' : 'No records uploaded.'}
              value={healthRecordsCount ? `${healthRecordsCount} File${healthRecordsCount === 1 ? '' : 's'}` : 'Add Record'}
              valueColor={PALETTE.sky} to={`/pet/${petId}/profile?tab=bloodwork`} error={errors.healthRecords}
            />
          </>
        )}
      </div>

      {checkInOpen && (
        <DailyCheckInModal
          pet={pet}
          checkInDate={todayStr()}
          existingCheckIn={todayCheckIn}
          onClose={() => setCheckInOpen(false)}
          onComplete={() => { setCheckInOpen(false); reloadAll(); }}
        />
      )}

      {weightLogOpen && (
        <WeightQuickLogSheet
          petId={petId}
          onClose={() => setWeightLogOpen(false)}
          onSaved={() => { setWeightLogOpen(false); reloadAll(); }}
        />
      )}

      <EditPetSheet pet={pet} open={editOpen} onOpenChange={setEditOpen} onSuccess={() => { setEditOpen(false); reloadAll(); }} />
      <MemorialDialog pet={pet} open={memorialOpen} onOpenChange={setMemorialOpen} onSuccess={() => { setMemorialOpen(false); reloadAll(); }} />

      {/* Delete Pet — Step 1: Warning */}
      <Dialog open={deletePetStep === 1} onOpenChange={(v) => !v && closeDeletePetFlow()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-serif text-2xl text-destructive">Delete {pet.name}?</DialogTitle>
          </DialogHeader>
          <DialogDescription asChild>
            <div className="space-y-3 text-base text-muted-foreground">
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
            <DialogTitle className="font-serif text-2xl text-destructive">Confirm Deletion</DialogTitle>
          </DialogHeader>
          <DialogDescription asChild>
            <div className="space-y-3 text-base text-muted-foreground">
              <p>Type <strong className="text-foreground font-mono">{pet.name}</strong> to confirm.</p>
            </div>
          </DialogDescription>
          <Input
            value={deletePetConfirmText}
            onChange={(e) => setDeletePetConfirmText(e.target.value)}
            placeholder={pet.name}
            className="font-mono"
            autoCapitalize="none"
            autoCorrect="off"
            disabled={deletingPet}
          />
          {deletePetError && <p className="text-base text-destructive">{deletePetError}</p>}
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
  );
}

// Skeleton for the Wellness Summary + Navigation Cards region — shown both
// while the pet header itself is still loading and, standalone, once the
// header has resolved but the detail batch (wellness/meds/food/etc.) hasn't.
function PetProfileDetailsSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading wellness summary and cards">
      <div className="h-32 rounded-2xl animate-pulse" style={{ background: 'rgba(255,255,255,0.05)' }} />
      {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
        <div key={i} className="h-20 rounded-2xl animate-pulse" style={{ background: 'rgba(255,255,255,0.05)' }} />
      ))}
    </div>
  );
}
