import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { entities } from '@/api/entities';
import { supabase } from '@/api/supabaseClient';
import {
  ChevronDown, Share2, Pencil, Trash2, Rainbow,
  Cat, Dog, UtensilsCrossed, Zap, Scale, HeartPulse, ClipboardList,
  Pill, Utensils, ShieldCheck, TrendingUp, Clock, FileText, FileDown, Droplets, Footprints, LineChart,
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import EditPetSheet from './EditPetSheet';
import MemorialDialog from './MemorialDialog';
import ListRow from './ListRow';
import ConfirmDeleteDialog from './ConfirmDeleteDialog';
import DailyCheckInModal from './DailyCheckInModal';
import { track } from '@/lib/analytics';
import {
  getObservationValuesForCheckIns, getCheckIn, getWellbeingDirections,
  yesterdayStr as yesterdayStrTz,
} from '@/lib/checkin/checkinClient';
import { getChipState } from '@/lib/checkin/chipLabels';
import {
  getWeightSummary, getVaccinationSummary, getTimelineEvents, getHealthRecordsCount,
} from '@/lib/checkin/petProfileClient';
import { getPetLabel } from '@/lib/speciesConfig';
import { computeDetailedAge } from '@/lib/lifeStage';
import { PALETTE, RING_COLOR } from '@/lib/toneColors';
import { useAuth } from '@/lib/AuthContext';
import { detectTimezone, dateStrInTimezone } from '@/lib/timezone';
import AttributeTrendChip from '@/components/AttributeTrendChip';
import { WELLBEING_ATTRIBUTES } from '@/lib/checkin/config';

// Daily Check-In, Vibe & Trends (spec v5) — the Pets-tab card's Wellbeing
// chips, always Energy/Mobility/Breathing/Skin-Itching/Behavior in this
// order.
const WELLBEING_CHIP_LABELS = { energy: 'Energy', mobility: 'Mobility', breathing: 'Breathing', itching: 'Skin / Itching', behavior: 'Behavior' };

const todayStr = (timezone) => dateStrInTimezone(timezone, 0);

// Fixed Observations chip slots — labels/state come from the shared
// chipLabels module so this screen and the Pets screen's PetCard never
// describe the same observation two different ways.
const OBSERVATION_SLOTS = [
  { code: 'appetite', label: 'Appetite', icon: UtensilsCrossed },
  { code: 'water_intake', label: 'Water', icon: Droplets },
  { code: 'energy', label: 'Energy', icon: Zap },
  { code: 'stool', label: 'Stool', icon: HeartPulse },
  { code: 'mobility', label: 'Activity', icon: Footprints },
];

// Summary card shared by Baseline/Conditions/Medications/Food/Vaccinations/
// Weight/Observations/Timeline/Health Records — icon + title + subtitle +
// summary value + chevron. Design System Amendment #8 (2026-07-30): this
// used to be its own local `NavCard` function, now the canonical `ListRow`
// (imported below), which also replaces MenuListRow.jsx's identical pattern.

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

function ExpandToggle({ expanded, onToggleExpanded }) {
  if (!onToggleExpanded) return null;
  return (
    <button
      type="button"
      onClick={onToggleExpanded}
      aria-expanded={expanded}
      className="w-full flex items-center justify-center gap-1.5 py-2 min-h-[44px] text-[13px] font-semibold text-tier-secondary"
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
export default function PetProfileContent({ petId, onReload, expanded = true, onToggleExpanded, context }) {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const timezone = user?.timezone || detectTimezone() || 'UTC';

  const [pet, setPet] = useState(null);
  const [petError, setPetError] = useState(false);
  const [headerLoading, setHeaderLoading] = useState(true);
  const [detailsLoading, setDetailsLoading] = useState(true);

  // Only populated in context="pets" — the Pets-tab card's Wellbeing chips.
  const [wellbeingDirections, setWellbeingDirections] = useState(null);
  const [wellbeingUnavailable, setWellbeingUnavailable] = useState(false);
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
  const [editOpen, setEditOpen] = useState(false);
  const [memorialOpen, setMemorialOpen] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [deletePetStep, setDeletePetStep] = useState(0);
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

    const [weightR, checkInR] = await Promise.allSettled([
      getWeightSummary(petId),
      getCheckIn(petId, todayStr(timezone)),
    ]);

    const nextErrors = {};

    setWeightSummary(weightR.status === 'fulfilled' ? weightR.value : null);
    if (weightR.status === 'rejected') { console.error(weightR.reason); nextErrors.weight = true; }

    // Wellbeing chips (Energy/Mobility/Breathing/Itching/Behavior) are only
    // rendered in the Pets-tab collapsed card, so this extra fetch is
    // skipped entirely for the standalone Pet Profile route.
    if (context === 'pets') {
      try {
        const todayCheckIn = checkInR.status === 'fulfilled' ? checkInR.value : null;
        const yesterdayCheckIn = await getCheckIn(petId, yesterdayStrTz(timezone));
        setWellbeingDirections(await getWellbeingDirections(petId, todayCheckIn, yesterdayCheckIn));
        setWellbeingUnavailable(false);
      } catch (err) {
        console.error(err);
        setWellbeingDirections(null);
        setWellbeingUnavailable(true);
      }
    }

    setTodayCheckIn(checkInR.status === 'fulfilled' ? checkInR.value : null);
    if (checkInR.status === 'rejected') { console.error(checkInR.reason); nextErrors.observations = true; }

    setErrors((prev) => ({ ...prev, ...nextErrors }));
    setDetailsLoading(false);
  }, [petId, timezone, context]);

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
      getCheckIn(petId, todayStr(timezone)),
    ]);

    const [medsR, foodsR, vaxR, onboardingR, timelineR, healthRecordsR, checkInR] = results;

    const nextErrors = {};

    setMedications(medsR.status === 'fulfilled' ? medsR.value : []);
    if (medsR.status === 'rejected') { console.error(medsR.reason); nextErrors.medications = true; }

    const todayStrVal = todayStr(timezone);
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
  }, [petId, timezone]);

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
    // Scoped to this specific pet's id, not a bare flag — this component
    // renders once per pet on the Pets screen (spec 0023 step 10), so a
    // bare '1' would fire the check-in sheet open for every pet card at
    // once instead of just the intended one.
    if (searchParams.get('startCheckin') === petId) {
      track('daily_check_in_started', { pet_id: petId, check_in_date: todayStr(timezone) });
      setCheckInOpen(true);
      setSearchParams((prev) => { prev.delete('startCheckin'); return prev; }, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const openDeletePetFlow = () => {
    setDeletePetError('');
    setDeletePetStep(1);
    track('pet_delete_started', { pet_id: petId });
  };
  const closeDeletePetFlow = () => {
    if (!deletingPet) {
      setDeletePetStep(0);
      setDeletePetError('');
      track('pet_delete_cancelled', { pet_id: petId });
    }
  };
  const handleDeletePetStepChange = (step) => (step === 0 ? closeDeletePetFlow() : setDeletePetStep(step));
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
        <p className="text-tier-secondary">Unable to load profile.</p>
        <button onClick={loadSummary} className="rounded-xl px-4 py-2 text-sm font-semibold border-2" style={{ background: 'hsl(var(--background))', borderColor: PALETTE.sky, color: '#fff' }}>Retry</button>
      </div>
    );
  }

  if (headerLoading || !pet) return <PetProfileDetailsSkeleton />;

  const isMemorial = pet.is_memorial;
  const isPrimaryOwner = currentUserId && pet.created_by === currentUserId;
  const hasLinkedCoOwner = petCoOwners.some((c) => c.co_owner_user_id);
  const age = computeDetailedAge(pet);
  const checkedInToday = todayCheckIn?.check_in_date === todayStr(timezone);

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
            <Dog className="h-10 w-10 text-tier-tertiary" />
          ) : (
            <Cat className="h-10 w-10 text-tier-tertiary" />
          )}
        </div>
        <h2 className="text-[28px] font-bold text-white mt-3 leading-tight">{pet.name}</h2>
        <p className="text-[14px] text-tier-tertiary mt-0.5">
          {getPetLabel(pet.species)}{pet.breed ? ` · ${pet.breed}` : ''}{pet.sex ? ` · ${pet.sex}` : ''}
        </p>
        {age && <p className="text-[14px] text-tier-tertiary">{age}</p>}

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
            {/* ── WELLBEING CHIPS ── */}
            {/* Always visible — this and the identity block above are the
                Pets-tab card's collapsed state (Nav + Daily Check-In UX
                Refresh spec #6: "Collapse info after the top circles").
                Everything below (actions + nav cards) only renders when
                expanded.
                Daily Check-In, Vibe & Trends (spec v5): the Pets-tab card
                (context="pets", the only context this component is ever
                mounted with — the former context="profile" standalone-page
                branch was deleted in spec 0026 as unreachable dead code,
                see docs/features/0026_Edit_Todays_CheckIn_Specification_v1.md)
                shows five Wellbeing directional chips — no score of any
                kind is ever shown here. */}
            {context === 'pets' && (
              <div className="rounded-2xl px-4 py-4 bg-card border border-border">
                {wellbeingUnavailable ? (
                  <p className="text-base text-tier-tertiary text-center py-4">Unable to load wellbeing.</p>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    {WELLBEING_ATTRIBUTES.map((code) => (
                      <AttributeTrendChip
                        key={code}
                        label={WELLBEING_CHIP_LABELS[code]}
                        direction={wellbeingDirections?.[code]}
                        state={!wellbeingDirections ? 'loading' : !checkedInToday ? 'no-checkin' : 'ready'}
                        interactive
                        onClick={() => navigate(`/pet/${petId}/trends?section=trends&group=wellness&metric=${code}`)}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}

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
              <p role="status" className="text-center text-sm text-tier-tertiary w-full">{shareFeedback}</p>
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
              <p role="status" className="text-center text-sm text-tier-tertiary">{shareFeedback}</p>
            )}

            {/* ── BASELINE ── */}
            <ListRow
              icon={HeartPulse} iconBg="rgba(76,199,176,0.15)" iconColor={PALETTE.teal}
              title="Baseline" subtitle={baselineSubtitle}
              value={baselineValue} valueColor={baselineState === 'complete' ? PALETTE.teal : PALETTE.amber}
              to={`/pet/${petId}/profile?tab=baseline`} error={errors.baseline}
            />

            {/* ── CONDITIONS ── */}
            {/* No dedicated Condition Management screen exists yet — conditions
                are edited via the Edit Pet sheet's condition chips. */}
            <ListRow
              icon={ClipboardList} iconBg="rgba(244,199,107,0.15)" iconColor={PALETTE.amber}
              title="Conditions" subtitle={conditionsCount > 0 ? 'Chronic conditions and diagnoses' : 'No conditions added.'}
              value={conditionsCount > 0 ? conditionsCount : 'Add Condition'}
              valueColor={conditionsCount > 0 ? '#fff' : PALETTE.amber}
              onClick={() => setEditOpen(true)}
            />

            {/* ── MEDICATIONS ── */}
            <ListRow
              icon={Pill} iconBg="rgba(111,183,255,0.15)" iconColor={PALETTE.sky}
              title="Medications" subtitle={medicationsCount > 0 ? `${medicationsCount} active medication${medicationsCount === 1 ? '' : 's'}` : 'No medications.'}
              value={medicationsCount > 0 ? medicationsCount : 'Add Medication'}
              valueColor={medicationsCount > 0 ? '#fff' : PALETTE.sky}
              to={`/pet/${petId}/profile?tab=medications`} error={errors.medications}
            />

            {/* ── FOOD ── */}
            <ListRow
              icon={Utensils} iconBg="rgba(76,199,176,0.15)" iconColor={PALETTE.teal}
              title="Food" subtitle={foodsCount > 0 ? `${foodsCount} active food${foodsCount === 1 ? '' : 's'}` : 'No food configured.'}
              value={foodsCount > 0 ? foodsCount : 'Add Food'}
              valueColor={foodsCount > 0 ? '#fff' : PALETTE.teal}
              to={`/pet/${petId}/food`} error={errors.food}
            />

            {/* ── VACCINATIONS ── */}
            <ListRow
              icon={ShieldCheck} iconBg="rgba(111,183,255,0.15)" iconColor={PALETTE.sky}
              title="Vaccinations" subtitle={vaxSummary.total === 0 ? 'No vaccinations recorded.' : vaxSummary.isOverdue ? 'Overdue' : 'Up to date'}
              value={vaxSummary.total === 0 ? 'Add Vaccination' : `${vaxSummary.current} / ${vaxSummary.total}`}
              valueColor={vaxSummary.total === 0 ? PALETTE.sky : vaxSummary.isOverdue ? PALETTE.red : PALETTE.sky}
              to={`/pet/${petId}/profile?tab=vaccines`} error={errors.vaccinations}
            />

            {/* ── WEIGHT ── */}
            <ListRow
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
            </ListRow>

            {/* ── OBSERVATIONS ── */}
            {checkedInToday ? (
              <ListRow
                icon={TrendingUp} iconBg="rgba(244,199,107,0.15)" iconColor={PALETTE.amber}
                title="Observations" subtitle="Trends and recent observations"
                value="Edit Daily Check-In" valueColor={PALETTE.amber}
                onClick={() => setCheckInOpen(true)} error={errors.observations}
              >
                <div className="grid grid-cols-5 gap-1.5 mt-3">
                  {OBSERVATION_SLOTS.map(({ code, label, icon: Icon }) => {
                    const { label: value, tone } = getChipState(code, todayCheckIn?.status, todayObservationValues);
                    return (
                      <div key={code} className="rounded-xl px-1.5 py-2 flex flex-col items-center gap-1 text-center" style={{ background: 'rgba(255,255,255,0.04)' }}>
                        <Icon className="h-3.5 w-3.5 text-tier-tertiary" />
                        <p className="text-[13px] text-tier-tertiary truncate w-full">{label}</p>
                        <p className="text-[13px] font-semibold truncate w-full" style={{ color: RING_COLOR[tone] }}>{value}</p>
                      </div>
                    );
                  })}
                </div>
              </ListRow>
            ) : (
              <ListRow
                icon={TrendingUp} iconBg="rgba(244,199,107,0.15)" iconColor={PALETTE.amber}
                title="Observations" subtitle="No observations yet."
                value="Start Daily Check-In" valueColor={PALETTE.amber}
                onClick={() => setCheckInOpen(true)} error={errors.observations}
              />
            )}

            {/* ── TRENDS ── */}
            {/* Previously reachable from Pets only via the collapsed-state
                Wellbeing chips (see AttributeTrendChip above) — this card
                makes it a first-class, discoverable destination from the
                expanded view too (spec 0023 step 7). Trends itself is
                unchanged; this only adds a link to it. */}
            <ListRow
              icon={LineChart} iconBg="rgba(111,183,255,0.15)" iconColor={PALETTE.sky}
              title="Trends" subtitle="Range charts and patterns over time"
              to={`/pet/${petId}/trends`}
            />

            {/* ── VET EXPORT ── */}
            <ListRow
              icon={FileDown} iconBg="rgba(244,199,107,0.15)" iconColor={PALETTE.amber}
              title="Vet Report" subtitle="Download a clinic-ready health report"
              to={`/pet/${petId}/export`}
            />

            {/* ── TIMELINE ── */}
            <ListRow
              icon={Clock} iconBg="rgba(169,174,181,0.15)" iconColor={PALETTE.gray}
              title="Timeline" subtitle={timelineCount ? 'Complete health history' : "Events will appear as your pet's health history grows."}
              value={timelineCount ? `${timelineCount} Event${timelineCount === 1 ? '' : 's'}` : null}
              valueColor={PALETTE.gray} to={`/pet/${petId}/timeline`} error={errors.timeline}
            />

            {/* ── HEALTH RECORDS ── */}
            {/* Links to the existing Bloodwork tab (real data the count is
                derived from) rather than the unrelated Documents placeholder,
                so the number shown here always matches what's on the other side. */}
            <ListRow
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
          checkInDate={todayStr(timezone)}
          isCatchUp={false}
          existingCheckIn={todayCheckIn}
          onClose={() => setCheckInOpen(false)}
          onComplete={() => { setCheckInOpen(false); reloadAll(); }}
        />
      )}

      <EditPetSheet pet={pet} open={editOpen} onOpenChange={setEditOpen} onSuccess={() => { setEditOpen(false); reloadAll(); }} />
      <MemorialDialog pet={pet} open={memorialOpen} onOpenChange={setMemorialOpen} onSuccess={() => { setMemorialOpen(false); reloadAll(); }} />

      {/* Delete Pet — two-step type-to-confirm flow */}
      <ConfirmDeleteDialog
        step={deletePetStep}
        onOpenChange={handleDeletePetStepChange}
        title={`Delete ${pet.name}?`}
        warning={
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
        }
        confirmText={pet.name}
        confirmLabel="Delete Pet"
        confirmingLabel="Deleting…"
        confirming={deletingPet}
        confirmDisabled={!isOnline}
        error={deletePetError}
        onConfirm={handleDeletePet}
      />
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
