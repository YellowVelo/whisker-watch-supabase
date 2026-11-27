// Pet data for ask-vet-assistant's prompts (spec 0080 FR2, FR6, FR7, FR8).
//
// Every loader takes the CALLER's Supabase client (publishable key plus the
// caller's own Authorization header), never the service role, so the
// database's access rules decide what the AI may be told about:
//   - a pet the caller can't see comes back as null (index.ts answers 403);
//   - a sitter sees a sat pet during the sit, as today (pets_select_sitter),
//     and its check-ins and weights (observations, migration 0045), but not
//     its medications or baseline (owner-only tables);
//   - household chat and the multi-pet scan only ever list pets the caller
//     owns or co-owns (spec 0076 / 0079), never sitter-only pets.
//
// Each loader returns plain objects shaped for the builders in ./prompts.ts.
// Query errors are thrown; index.ts reports them.
//
// The reads mirror what the app did before spec 0080:
//   - pet chat / insights: AskWyskerSheet.jsx (Pet.get, Medication.filter,
//     PetOnboarding.filter); weight as src/lib/weightClient.js reads it
//     (spec 0081, through ../_shared/weight.ts)
//   - household chat: AskWyskerSheet.jsx (loadOwnedPets minus memorial pets)
//   - multi-pet scan: VaccinationSection.jsx (listOwnedPets)
//   - Trends summary: InsightSummaryCard.jsx + trendsClient.js
//     (getObservationTrend, getWeightTrend, describeCurrentState,
//     getInsightSummary's "2 non-skipped of the last 10" gate)
//
// Spec 0012 v5: the Vibe (status) and the symptoms are loaded side by side
// and never combined here; no score of any kind is computed.

import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2.119.2';
import {
  attributeDaySeries,
  COUNTED_ATTRIBUTES,
  dateStrInTimezone,
  isCountableSymptom,
  type CheckInRow,
  type ObservationRow,
} from '../_shared/checkinRules.ts';
import {
  hasEnoughCheckIns,
  type AttributeNow,
  type BaselineInfo,
  type CheckInDay,
  type CheckInSymptom,
  type HouseholdPet,
  type MedicationInfo,
  type PetInfo,
  type TrendsSummaryContext,
  type WeightEntry,
  type WeightNow,
} from './prompts.ts';
import { currentAndDelta, loadDailyWeights, weightsInRange } from '../_shared/weight.ts';
import { isCurrentItem } from '../_shared/currentItems.ts';

// Same as src/lib/checkin/trendsRanges.js RANGE_DAYS.
export const RANGE_DAYS: Readonly<Record<string, number>> = { '24H': 5, '7D': 7, '30D': 30, '90D': 90, '1Y': 365 };

// Pet Insights reads this many calendar days of check-ins, ending today in
// the caller's time zone (today and the 29 days before it).
export const INSIGHTS_WINDOW_DAYS = 30;

// Insights tells the AI about at most this many days with a weight, newest
// first (one weight per day), to keep the prompt bounded.
export const INSIGHTS_WEIGHT_DAYS = 200;

// getInsightSummary's gate: at least 2 non-skipped among the 10 newest.
export const SUMMARY_GATE_CHECK_INS = 10;

export interface PetRecord extends PetInfo {
  id: string;
  is_memorial: boolean;
}

function fail(what: string, error: { message?: string } | null): never {
  throw new Error(`${what} failed: ${error?.message ?? 'unknown error'}`);
}

// ---------------------------------------------------------------------------
// The pet and its owner-only details
// ---------------------------------------------------------------------------

// The pet row, or null when the caller can't see it (RLS filtered it out,
// or it doesn't exist). Sitters see a sat pet during the sit.
export async function loadPet(client: SupabaseClient, petId: string): Promise<PetRecord | null> {
  const { data, error } = await client
    .from('pets')
    .select('id, name, species, breed, birth_date, conditions, is_memorial')
    .eq('id', petId)
    .maybeSingle();
  if (error) fail('pet lookup', error);
  if (!data) return null;
  return {
    id: data.id,
    name: data.name,
    species: data.species ?? null,
    breed: data.breed ?? null,
    birth_date: data.birth_date ?? null,
    conditions: data.conditions ?? null,
    is_memorial: !!data.is_memorial,
  };
}

// Current medications only (spec 0087): switched on AND not ended before
// `todayStr` (YYYY-MM-DD on the caller's calendar), by the shared rule in
// ../_shared/currentItems.ts. A med whose end date has passed is left out
// even if it was never switched off.
export async function loadActiveMedications(
  client: SupabaseClient,
  petId: string,
  todayStr: string,
): Promise<MedicationInfo[]> {
  const { data, error } = await client
    .from('medications')
    .select('name, dosage, frequency, active, end_date')
    .eq('pet_id', petId)
    .eq('active', true)
    .order('start_date', { ascending: false });
  if (error) fail('medications lookup', error);
  return (data ?? []).filter((m) => isCurrentItem(m, todayStr)).map((m) => ({
    name: m.name,
    dosage: m.dosage ?? null,
    frequency: m.frequency ?? null,
    active: m.active === true,
  }));
}

// The pet's pet_onboarding row (its baseline), or null.
export async function loadBaseline(client: SupabaseClient, petId: string): Promise<BaselineInfo | null> {
  const { data, error } = await client
    .from('pet_onboarding')
    .select('health_status, appetite_baseline, water_baseline, energy_baseline, mobility_baseline, bathroom_baseline')
    .eq('pet_id', petId)
    .limit(1);
  if (error) fail('baseline lookup', error);
  return data?.[0] ?? null;
}

// The pet's weights (spec 0081, PA-71): weight `observations` of both kinds
// (check-in and standalone), one per day, dated and picked the same way as
// the app (../_shared/weight.ts). At most `dayLimit` days, newest first.
export async function loadWeights(client: SupabaseClient, petId: string, dayLimit = INSIGHTS_WEIGHT_DAYS): Promise<WeightEntry[]> {
  const days = await loadDailyWeights(client, petId);
  return days.slice(0, dayLimit);
}

// The caller's saved time zone (profiles.timezone), or null. The date
// helpers fall back to UTC for null or an invalid zone.
export async function loadCallerTimezone(client: SupabaseClient, userId: string): Promise<string | null> {
  const { data, error } = await client.from('profiles').select('timezone').eq('id', userId).maybeSingle();
  if (error) fail('time zone lookup', error);
  return data?.timezone ?? null;
}

// ---------------------------------------------------------------------------
// Daily check-ins
// ---------------------------------------------------------------------------

// Same source as the app's loadObservationCatalog (checkinClient.js):
// observation_types for the attribute code and label, observation_options
// for each answer's label.
interface Catalog {
  typeById: Map<string, { code: string; label: string }>;
  idByCode: Map<string, string>;
  optionLabel: (typeId: string, value: string) => string;
}

export async function loadObservationCatalog(client: SupabaseClient): Promise<Catalog> {
  const [typesR, optionsR] = await Promise.all([
    client.from('observation_types').select('id, code, label'),
    client.from('observation_options').select('observation_type_id, value, label'),
  ]);
  if (typesR.error) fail('observation types lookup', typesR.error);
  if (optionsR.error) fail('observation options lookup', optionsR.error);
  const typeById = new Map<string, { code: string; label: string }>();
  const idByCode = new Map<string, string>();
  for (const t of typesR.data ?? []) {
    typeById.set(t.id, { code: t.code, label: t.label });
    idByCode.set(t.code, t.id);
  }
  const labels = new Map<string, string>();
  for (const o of optionsR.data ?? []) labels.set(`${o.observation_type_id}\u0000${o.value}`, o.label);
  return {
    typeById,
    idByCode,
    // Same fallback as trendsClient: the raw value if no option matches.
    optionLabel: (typeId, value) => labels.get(`${typeId}\u0000${value}`) || value,
  };
}

interface RawObservation {
  observation_type_id: string;
  value: string | null;
}

interface RawCheckIn {
  id: string;
  check_in_date: string;
  status: string | null;
  observations: RawObservation[] | null;
}

const CHECK_IN_WITH_OBSERVATIONS = 'id, check_in_date, status, observations(observation_type_id, value)';

// The last INSIGHTS_WINDOW_DAYS calendar days of check-ins (today and the
// days before it, in the caller's time zone), each with its answers for the
// 11 counted attributes only. Raw values are kept so prompts.ts can tell
// symptoms from baseline / "Not observed" answers (isCountableSymptom).
// Oldest first.
export async function loadRecentCheckIns(
  client: SupabaseClient,
  petId: string,
  timezone: string | null | undefined,
  nowMs: number = Date.now(),
  catalog?: Catalog,
): Promise<CheckInDay[]> {
  const today = dateStrInTimezone(timezone, 0, nowMs);
  const start = dateStrInTimezone(timezone, -(INSIGHTS_WINDOW_DAYS - 1), nowMs);
  const [rowsR, cat] = await Promise.all([
    client
      .from('daily_check_ins')
      .select(CHECK_IN_WITH_OBSERVATIONS)
      .eq('pet_id', petId)
      .gte('check_in_date', start)
      .lte('check_in_date', today)
      .order('check_in_date', { ascending: true }),
    catalog ? Promise.resolve(catalog) : loadObservationCatalog(client),
  ]);
  if (rowsR.error) fail('check-in lookup', rowsR.error);
  const rows = (rowsR.data ?? []) as RawCheckIn[];
  return rows.map((row): CheckInDay => {
    const symptoms: CheckInSymptom[] = [];
    for (const obs of row.observations ?? []) {
      const type = cat.typeById.get(obs.observation_type_id);
      if (!type || !COUNTED_ATTRIBUTES.includes(type.code)) continue;
      symptoms.push({
        code: type.code,
        attribute: type.label,
        value: obs.value,
        label: obs.value == null ? '' : cat.optionLabel(obs.observation_type_id, obs.value),
      });
    }
    return { date: row.check_in_date, status: row.status, symptoms };
  });
}

// ---------------------------------------------------------------------------
// Trends summary
// ---------------------------------------------------------------------------

// Port of trendsClient.js describeCurrentState.
const SYMPTOM_COUNT_LABEL: Readonly<Record<number, string>> = { 0: 'Normal', 1: '1 Symptom', 2: '2+ Symptoms' };

function describeCurrentState(
  point: { state: string; count: number | null } | undefined,
  symptomLabels: string[],
): AttributeNow {
  if (!point || point.state === 'skipped') return { currentLabel: null, currentSubtitle: null };
  if (point.state === 'not_observed') return { currentLabel: 'Not Observed', currentSubtitle: null };
  if (point.count === 0) return { currentLabel: 'Normal', currentSubtitle: 'No change from usual' };
  const currentLabel = SYMPTOM_COUNT_LABEL[Math.min(2, point.count ?? 0)];
  return { currentLabel, currentSubtitle: symptomLabels.join(', ') || null };
}

// getObservationTrend's currentLabel/currentSubtitle for one attribute.
// Those come only from the newest check-in in the range, and only if it's
// dated today; otherwise both are null. `newest` is that newest check-in
// (or null if the range has none).
function attributeNow(newest: RawCheckIn | null, code: string, today: string, cat: Catalog): AttributeNow {
  const typeId = cat.idByCode.get(code);
  if (!newest || !typeId) return { currentLabel: null, currentSubtitle: null };
  if (newest.check_in_date !== today) return { currentLabel: null, currentSubtitle: null };
  const observations = (newest.observations ?? []).filter((o) => o.observation_type_id === typeId);
  const checkIn: CheckInRow = { id: newest.id, check_in_date: newest.check_in_date, status: newest.status };
  const obsRows: ObservationRow[] = observations.map((o) => ({ daily_check_in_id: newest.id, value: o.value }));
  const [point] = attributeDaySeries([checkIn], obsRows);
  const labels = newest.status === 'skipped'
    ? []
    : observations.filter((o) => isCountableSymptom(o.value)).map((o) => cat.optionLabel(typeId, o.value as string));
  return describeCurrentState(point, labels);
}

// getWeightTrend's currentLbs/deltaLbs: one weight per day, those dated on
// or after the range's cutoff, newest day versus the one before it.
function weightNow(weightsNewestFirst: WeightEntry[], cutoff: string): WeightNow {
  return currentAndDelta(weightsInRange(weightsNewestFirst, cutoff));
}

export type TrendsSummaryInputs = Omit<TrendsSummaryContext, 'petName'>;

// Everything buildTrendsSummary needs except the pet's name, for the range
// the Trends tab is showing. Returns null when the pet has fewer than 2
// non-skipped check-ins among its 10 newest (getInsightSummary's rule):
// the caller then answers { summary: null } without calling the AI.
export async function loadTrendsSummaryInputs(
  client: SupabaseClient,
  petId: string,
  range: string,
  timezone: string | null | undefined,
  nowMs: number = Date.now(),
): Promise<TrendsSummaryInputs | null> {
  const { data: recent, error: recentError } = await client
    .from('daily_check_ins')
    .select('status')
    .eq('pet_id', petId)
    .order('check_in_date', { ascending: false })
    .limit(SUMMARY_GATE_CHECK_INS);
  if (recentError) fail('check-in lookup', recentError);
  if (!hasEnoughCheckIns(recent ?? [])) return null;

  const days = RANGE_DAYS[range] ?? RANGE_DAYS['24H'];
  const today = dateStrInTimezone(timezone, 0, nowMs);
  const cutoff = dateStrInTimezone(timezone, -days, nowMs);

  // getObservationTrend's "now" depends only on the newest check-in on or
  // after the cutoff, so that one row (with its answers) is all that's read.
  const [newestR, cat, weights] = await Promise.all([
    client
      .from('daily_check_ins')
      .select(CHECK_IN_WITH_OBSERVATIONS)
      .eq('pet_id', petId)
      .gte('check_in_date', cutoff)
      .order('check_in_date', { ascending: false })
      .limit(1),
    loadObservationCatalog(client),
    loadDailyWeights(client, petId),
  ]);
  if (newestR.error) fail('check-in lookup', newestR.error);
  const newest = ((newestR.data ?? []) as RawCheckIn[])[0] ?? null;

  return {
    appetite: attributeNow(newest, 'appetite', today, cat),
    waterIntake: attributeNow(newest, 'water_intake', today, cat),
    energy: attributeNow(newest, 'energy', today, cat),
    weight: weightNow(weights, cutoff),
  };
}

// ---------------------------------------------------------------------------
// The caller's own pets
// ---------------------------------------------------------------------------

interface OwnedPetRow {
  id: string;
  name: string;
  species: string | null;
  breed: string | null;
  conditions: string[] | null;
  is_memorial: boolean;
  created_at: string;
}

// Pets the caller created plus pets they co-own (pet_co_owners linked to
// their account). The same set as the app's listOwnedPets(): sitter-only
// pets are never included. Newest first (by created_at), like Home's
// '-created_at' order.
async function loadOwnedPetRows(client: SupabaseClient, userId: string): Promise<OwnedPetRow[]> {
  const fields = 'id, name, species, breed, conditions, is_memorial, created_at';
  const [createdR, coOwnedR] = await Promise.all([
    client.from('pets').select(fields).eq('created_by', userId),
    client.from('pet_co_owners').select('pet_id').eq('co_owner_user_id', userId),
  ]);
  if (createdR.error) fail('owned pets lookup', createdR.error);
  if (coOwnedR.error) fail('co-owned pets lookup', coOwnedR.error);

  const byId = new Map<string, OwnedPetRow>();
  for (const p of (createdR.data ?? []) as OwnedPetRow[]) byId.set(p.id, p);
  const coOwnedIds = [...new Set((coOwnedR.data ?? []).map((r) => r.pet_id as string))].filter((id) => !byId.has(id));
  if (coOwnedIds.length > 0) {
    const { data, error } = await client.from('pets').select(fields).in('id', coOwnedIds);
    if (error) fail('co-owned pets lookup', error);
    for (const p of (data ?? []) as OwnedPetRow[]) byId.set(p.id, p);
  }
  return [...byId.values()].sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0));
}

// Household chat (FR6): owned and co-owned pets, memorial pets left out
// (as AskWyskerSheet does before showing GeneralAskWyskerChat).
export async function loadHouseholdPets(client: SupabaseClient, userId: string): Promise<HouseholdPet[]> {
  const rows = await loadOwnedPetRows(client, userId);
  return rows
    .filter((p) => !p.is_memorial)
    .map((p) => ({ name: p.name, species: p.species ?? null, breed: p.breed ?? null, conditions: p.conditions ?? null }));
}

// Multi-pet vaccine scan (FR7): every owned and co-owned pet, memorial pets
// included (VaccinationSection uses listOwnedPets() unfiltered).
export async function loadOwnedPetNames(client: SupabaseClient, userId: string): Promise<{ name: string | null }[]> {
  const rows = await loadOwnedPetRows(client, userId);
  return rows.map((p) => ({ name: p.name ?? null }));
}

// True if the caller owns or co-owns the pet (is_pet_owner(), migration
// 0059: signed-in callable, answers only about the caller). Sitters get
// false. Used where the result is something only owners may save, such as
// bloodwork (owners and co-owners only, migration 0004).
export async function callerOwnsPet(client: SupabaseClient, petId: string, userId: string): Promise<boolean> {
  const { data, error } = await client.rpc('is_pet_owner', { p_pet_id: petId, p_user_id: userId });
  if (error) fail('pet owner check', error);
  return data === true;
}
