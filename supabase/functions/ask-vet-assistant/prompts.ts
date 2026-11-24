// The AI instructions for ask-vet-assistant's 8 tasks (spec 0080, PA-11).
//
// Before spec 0080 the app wrote these instructions itself and the server
// passed them on, so anyone signed in could send their own. Now the app
// only names a task and sends ids and the owner's own words; the server
// builds the instructions here. The wording is copied from the 8 app call
// sites it replaces (PetAIChat, GeneralAskWyskerChat, PetAIInsights,
// trendsClient getInsightSummary, VaccinationSection,
// onboarding/VaccinationEntryCard, onboarding/MedicationEntryCard,
// BloodworkSection) and from src/lib/aiGuardrails.js.
//
// Pure on purpose: no network, no Supabase client, no Deno APIs, so every
// builder and check is unit-tested directly (supabase/tests/ai_prompts.test.ts).
// Data loading is context.ts's job; file path safety stays in index.ts.
//
// Every builder returns { system, user, schema }:
//   - system: every fixed instruction, ending with the "respond with ONLY
//     valid JSON" line index.ts used to append. Send it as Anthropic's
//     `system` field.
//   - user: the pet data and, for chats, the owner's own words. The owner's
//     question and history only ever appear here, never in `system`. Empty
//     for the scans (the file is the whole user message).
//   - schema: the response shape, same as the app used to send.

import {
  BLOODWORK_FIELDS,
  detectEmergencyKeywords,
  HEALTH_OPTIONS,
  APPETITE_OPTIONS,
  WATER_OPTIONS,
  ENERGY_OPTIONS,
  getMobilityOptions,
  getBathroomOptions,
  PET_SCREEN_NAMES,
  type OptionLabel,
} from './rules.ts';
import { isCountableSymptom } from '../_shared/checkinRules.ts';

// ---------------------------------------------------------------------------
// Safety sentences (moved from src/lib/aiGuardrails.js, spec 0041).
// ---------------------------------------------------------------------------
export const AI_DISCLAIMER_SENTENCE = 'Always recommend consulting a licensed veterinarian for diagnosis, prescriptions, or emergencies. Keep responses concise, calm, and friendly — never diagnose, prescribe, or state a condition as certain.';

export const URGENT_FLAG_INSTRUCTION = 'Additionally include a boolean "urgent" field. Set "urgent": true only if this describes a real, time-sensitive veterinary emergency (e.g. suspected poisoning, difficulty breathing, collapse, seizure, uncontrolled bleeding, inability to urinate, or severe trauma) — not for routine or mild concerns. Never create unnecessary alarm.';

// The line index.ts appended to every schema request before spec 0080.
export function jsonInstruction(schema: JsonSchema): string {
  return `Respond with ONLY valid JSON matching this schema, no other text, no markdown code fences:\n${JSON.stringify(schema)}`;
}

// ---------------------------------------------------------------------------
// Tasks and request limits
// ---------------------------------------------------------------------------
export const TASK_NAMES = [
  'pet_chat',
  'household_chat',
  'pet_insights',
  'trends_summary',
  'scan_vaccines', // multi-pet document scan (VaccinationSection)
  'scan_vaccine_single', // onboarding VaccinationEntryCard
  'scan_medication', // onboarding MedicationEntryCard
  'scan_bloodwork', // BloodworkSection
] as const;

export type TaskName = typeof TASK_NAMES[number];

export const SCAN_TASKS: readonly TaskName[] = ['scan_vaccines', 'scan_vaccine_single', 'scan_medication', 'scan_bloodwork'];

export const TRENDS_RANGES: readonly string[] = ['24H', '7D', '30D', '90D', '1Y'];

export const MAX_QUESTION_CHARS = 2000;
export const MAX_HISTORY_ENTRIES = 20;
export const MAX_OWNER_MESSAGE_CHARS = 2000;
export const MAX_ASSISTANT_MESSAGE_CHARS = 8000;

// Pet Insights (FR8) and the Trends summary need at least this many
// non-skipped check-ins before the AI is called.
export const MIN_SCORABLE_CHECK_INS = 2;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export type JsonSchema = Record<string, unknown>;

export interface BuiltPrompt {
  system: string;
  user: string;
  schema: JsonSchema;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface PetInfo {
  name: string;
  species?: string | null;
  breed?: string | null;
  birth_date?: string | null;
  conditions?: string[] | null;
}

export interface MedicationInfo {
  name: string;
  dosage?: string | null;
  frequency?: string | null;
  active?: boolean | null;
}

// A pet_onboarding row (only the fields the baseline summary reads).
export interface BaselineInfo {
  health_status?: string | null;
  appetite_baseline?: string | null;
  water_baseline?: string | null;
  energy_baseline?: string | null;
  mobility_baseline?: string | null;
  bathroom_baseline?: string | null;
}

// One logged answer on a daily check-in. `value` is the raw observation
// value (so baseline / "Not observed" answers can be told apart);
// `attribute` and `label` are the observation_types / option labels.
export interface CheckInSymptom {
  attribute: string;
  value: string | null;
  label: string;
}

// One daily check-in. `status` is the Vibe: great | off | tough | skipped,
// or null for an unrated imported day.
export interface CheckInDay {
  date: string; // YYYY-MM-DD
  status: string | null;
  symptoms: CheckInSymptom[];
}

export interface WeightEntry {
  date: string; // YYYY-MM-DD
  grams: number;
}

// What a Trends card shows as "now" for one attribute (getObservationTrend's
// currentLabel/currentSubtitle).
export interface AttributeNow {
  currentLabel?: string | null;
  currentSubtitle?: string | null;
}

export interface WeightNow {
  currentLbs?: number | null;
  deltaLbs?: number | null;
}

export interface PetChatContext {
  pet: PetInfo;
  medications: MedicationInfo[];
  baseline: BaselineInfo | null;
  screen?: string | null;
  history: ChatMessage[];
  question: string;
  nowMs?: number;
}

export interface HouseholdPet {
  name: string;
  species?: string | null;
  breed?: string | null;
  conditions?: string[] | null;
}

export interface HouseholdChatContext {
  pets: HouseholdPet[];
  history: ChatMessage[];
  question: string;
}

export interface PetInsightsContext {
  pet: PetInfo;
  medications: MedicationInfo[];
  baseline: BaselineInfo | null;
  screen?: string | null;
  checkIns: CheckInDay[]; // last 30 days, any order
  weights: WeightEntry[]; // any order
  nowMs?: number;
}

export interface TrendsSummaryContext {
  petName: string;
  appetite: AttributeNow | null;
  waterIntake: AttributeNow | null;
  energy: AttributeNow | null;
  weight: WeightNow | null;
}

export interface ScanVaccinesContext {
  // The pets this person owns or co-owns (listOwnedPets()).
  ownedPets: { name: string | null }[];
}

// ---------------------------------------------------------------------------
// Shared formatting
// ---------------------------------------------------------------------------
const labelFor = (options: readonly OptionLabel[], value: string): string | undefined =>
  options.find((o) => o.value === value)?.label;

// Port of src/lib/baselineContext.js formatBaselineForAI (spec 0031).
export function formatBaselineForAI(
  baseline: BaselineInfo | null | undefined,
  petName: string,
  species: string | null | undefined,
): string | null {
  if (!baseline) return null;

  const parts = [
    baseline.health_status && labelFor(HEALTH_OPTIONS(petName), baseline.health_status),
    baseline.appetite_baseline && `Appetite: ${labelFor(APPETITE_OPTIONS, baseline.appetite_baseline)}`,
    baseline.water_baseline && `Water intake: ${labelFor(WATER_OPTIONS, baseline.water_baseline)}`,
    baseline.energy_baseline && `Energy: ${labelFor(ENERGY_OPTIONS, baseline.energy_baseline)}`,
    baseline.mobility_baseline && `Mobility: ${labelFor(getMobilityOptions(species), baseline.mobility_baseline)}`,
    baseline.bathroom_baseline && `Bathroom habits: ${labelFor(getBathroomOptions(species), baseline.bathroom_baseline)}`,
  ].filter(Boolean);

  return parts.length ? parts.join('; ') : null;
}

function ageInYears(birthDate: string | null | undefined, nowMs: number): number | null {
  if (!birthDate) return null;
  return Math.floor((nowMs - new Date(birthDate).getTime()) / (365.25 * 24 * 60 * 60 * 1000));
}

function activeMedsText(medications: MedicationInfo[] | null | undefined): string {
  return medications?.filter((m) => m.active).map((m) => `${m.name} ${m.dosage || ''} ${m.frequency || ''}`).join(', ') || 'None';
}

// Conversation history exactly as the chats used to write it, with the
// latest question as the final Owner line.
function conversationText(history: ChatMessage[], question: string): string {
  return [...history, { role: 'user', content: question }]
    .map((m) => `${m.role === 'user' ? 'Owner' : 'Vet Assistant'}: ${m.content}`)
    .join('\n\n');
}

function chatUserMessage(history: ChatMessage[], question: string): string {
  return `Conversation so far:\n${conversationText(history, question)}\n\nOwner's latest question: ${question}\n\nVet Assistant:`;
}

const CHAT_SCHEMA: JsonSchema = {
  type: 'object',
  properties: {
    reply: { type: 'string' },
    urgent: { type: 'boolean' },
  },
};

// ---------------------------------------------------------------------------
// Builders
// ---------------------------------------------------------------------------

// PetAIChat.jsx
export function buildPetChat(ctx: PetChatContext): BuiltPrompt {
  const { pet, medications, baseline, screen } = ctx;
  const conditions = pet.conditions?.join(', ') || 'None noted';
  const activeMeds = activeMedsText(medications);
  const age = ageInYears(pet.birth_date, ctx.nowMs ?? Date.now());
  const baselineSummary = formatBaselineForAI(baseline, pet.name, pet.species);
  const baselineSentence = baselineSummary ? ` ${pet.name}'s established baseline (what's normal for them, as reported by the owner): ${baselineSummary}.` : '';
  const screenSentence = screen ? ` The owner just came from ${pet.name}'s ${screen} screen, so lean toward that topic first if it's relevant, but answer whatever they actually ask.` : '';
  const intro = `You are a compassionate, experienced veterinarian with 20+ years of clinical practice. You are assisting the owner of a pet named ${pet.name}, a ${age ? age + '-year-old ' : ''}${pet.species || 'cat'} (${pet.breed || 'mixed breed'}) with the following known conditions: ${conditions}. Active medications: ${activeMeds}.${baselineSentence}${screenSentence} Answer questions clearly and practically. ${AI_DISCLAIMER_SENTENCE} ${URGENT_FLAG_INSTRUCTION}`;
  return {
    system: `${intro}\n\n${jsonInstruction(CHAT_SCHEMA)}`,
    user: chatUserMessage(ctx.history, ctx.question),
    schema: CHAT_SCHEMA,
  };
}

// GeneralAskWyskerChat.jsx
export function buildHouseholdChat(ctx: HouseholdChatContext): BuiltPrompt {
  const { pets } = ctx;
  const petList = pets?.length
    ? pets.map((p) => `${p.name} (${p.species || 'pet'}${p.breed ? ', ' + p.breed : ''}${p.conditions?.length ? ', conditions: ' + p.conditions.join(', ') : ''})`).join('; ')
    : 'no pets on file yet';
  const intro = `You are a compassionate, experienced veterinarian with 20+ years of clinical practice. You are assisting a pet owner whose household includes: ${petList}. The owner may ask about any one of these pets by name, or ask a general question. If it's unclear which pet a question concerns and the answer would differ by pet, ask them to clarify which pet they mean before answering. Answer questions clearly and practically. ${AI_DISCLAIMER_SENTENCE} ${URGENT_FLAG_INSTRUCTION}`;
  return {
    system: `${intro}\n\n${jsonInstruction(CHAT_SCHEMA)}`,
    user: chatUserMessage(ctx.history, ctx.question),
    schema: CHAT_SCHEMA,
  };
}

const INSIGHTS_SCHEMA: JsonSchema = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    insights: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          type: { type: 'string' },
          title: { type: 'string' },
          detail: { type: 'string' },
        },
      },
    },
    disclaimer: { type: 'string' },
    urgent: { type: 'boolean' },
  },
};

export const VIBE_LABELS: Readonly<Record<string, string>> = {
  great: 'Great Day',
  off: 'Off Day',
  tough: 'Tough Day',
  skipped: 'Skipped',
};

const byDateDesc = <T extends { date: string }>(rows: readonly T[]): T[] =>
  [...rows].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

export function scorableCheckInCount(checkIns: readonly { status: string | null }[]): number {
  return checkIns.filter((c) => c.status !== 'skipped').length;
}

export function hasEnoughCheckIns(checkIns: readonly { status: string | null }[]): boolean {
  return scorableCheckInCount(checkIns) >= MIN_SCORABLE_CHECK_INS;
}

// Spec 0012 v5: the Vibe (owner's rating) and the symptoms logged are two
// separate signals. They're listed in two separate sections and never
// combined, and no score is ever given. Symptoms on a skipped day are
// ignored, and baseline / "Not observed" answers aren't symptoms.
export function describeCheckIns(checkIns: readonly CheckInDay[]): { vibes: string; symptoms: string } {
  const days = byDateDesc(checkIns);
  const vibes = days.map((d) => `${d.date}: ${d.status ? (VIBE_LABELS[d.status] || d.status) : 'Not recorded'}`).join('\n');
  const symptoms = days
    .filter((d) => d.status !== 'skipped')
    .map((d) => {
      const logged = d.symptoms.filter((s) => isCountableSymptom(s.value));
      return logged.length ? `${d.date}: ${logged.map((s) => `${s.attribute}: ${s.label}`).join('; ')}` : null;
    })
    .filter((line): line is string => line !== null)
    .join('\n');
  return { vibes, symptoms };
}

// PetAIInsights.jsx, reading daily check-ins instead of the old symptom
// logs (spec 0080 FR8). Same response shape as before.
export function buildPetInsights(ctx: PetInsightsContext): BuiltPrompt {
  const { pet, medications, baseline, screen } = ctx;
  const activeMeds = activeMedsText(medications);
  const conditions = pet.conditions?.join(', ') || 'None noted';
  const species = pet.species || 'Cat';
  const age = ageInYears(pet.birth_date, ctx.nowMs ?? Date.now());
  const baselineSummary = formatBaselineForAI(baseline, pet.name, pet.species);
  const { vibes, symptoms } = describeCheckIns(ctx.checkIns);
  const weightText = byDateDesc(ctx.weights)
    .map((w) => `${w.date}: ${(w.grams / 453.6).toFixed(2)} lbs`)
    .join('\n');

  const profile = [
    `Pet Name: ${pet.name}`,
    `Species: ${species}`,
    age ? `Age: ${age} years` : '',
    `Breed: ${pet.breed || 'Unknown'}`,
    `Known Conditions: ${conditions}`,
    `Active Medications: ${activeMeds}`,
    baselineSummary ? `Established Baseline (owner-reported normal): ${baselineSummary}` : '',
    screen ? `The owner just came from ${pet.name}'s ${screen} screen, so lean toward that topic first if it's relevant.` : '',
  ].filter(Boolean).join('\n');
  const context = [
    profile,
    `Daily Vibe, last 30 days (the owner's own rating of each day, most recent first):\n${vibes || 'No daily check-ins in the last 30 days.'}`,
    `Symptoms logged, last 30 days (a separate record from the Vibe, most recent first; days with none are left out):\n${symptoms || 'No symptoms were logged in the last 30 days.'}`,
    `Weight (most recent first):\n${weightText || 'No weight recorded.'}`,
  ].join('\n\n');

  const intro = `You are a compassionate, experienced veterinarian with 20+ years of clinical practice reviewing a pet's health record. Analyze the following medical data and provide 3-5 specific, actionable observations or concerns. Focus on trends, anomalies, or patterns in the data. Be concise and practical. Each day's Vibe and the symptoms logged are two separate signals: never combine them, infer one from the other, or turn them into a score. ${AI_DISCLAIMER_SENTENCE} ${URGENT_FLAG_INSTRUCTION}

Respond in JSON with this structure:
{
  "summary": "1-2 sentence overall health summary",
  "insights": [
    { "type": "warning|info|positive", "title": "Short title", "detail": "1-2 sentences" }
  ],
  "disclaimer": "brief disclaimer",
  "urgent": false
}`;

  return {
    system: `${intro}\n\n${jsonInstruction(INSIGHTS_SCHEMA)}`,
    user: context,
    schema: INSIGHTS_SCHEMA,
  };
}

const TRENDS_SCHEMA: JsonSchema = { type: 'object', properties: { summary: { type: 'string' } } };

// trendsClient.js getInsightSummary
export function buildTrendsSummary(ctx: TrendsSummaryContext): BuiltPrompt {
  const { petName, appetite, waterIntake, energy, weight } = ctx;
  const describe = (label: string, obs: AttributeNow | null) =>
    `${label}: ${obs?.currentLabel || 'No Data'}${obs?.currentSubtitle ? ` (${obs.currentSubtitle})` : ''}`;
  const context = [
    `Pet: ${petName}`,
    describe('Appetite', appetite),
    describe('Water Intake', waterIntake),
    describe('Energy', energy),
    `Weight: ${weight?.currentLbs ?? 'No Data'} lbs${weight?.deltaLbs != null ? ` (${weight.deltaLbs > 0 ? '+' : ''}${weight.deltaLbs} lbs vs. previous entry)` : ''}`,
  ].join('\n');

  const intro = `You are summarizing recorded pet health observations for an owner, not diagnosing anything. Based only on the data below, write exactly one short paragraph (2-3 sentences) describing what has changed recently for ${petName}. Never diagnose, recommend treatment, or create alarm — describe observations only.

Respond in JSON: { "summary": "..." }`;

  return {
    system: `${intro}\n\n${jsonInstruction(TRENDS_SCHEMA)}`,
    user: context,
    schema: TRENDS_SCHEMA,
  };
}

const SCAN_VACCINES_SCHEMA: JsonSchema = {
  type: 'object',
  properties: {
    vaccines: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          vaccine_name: { type: 'string' },
          date_given: { type: 'string' },
          next_due_date: { type: 'string' },
          administered_by: { type: 'string' },
          lot_number: { type: 'string' },
          notes: { type: 'string' },
          pet_name: { type: 'string' },
        },
      },
    },
  },
};

// VaccinationSection.jsx (multi-pet document scan)
export function buildScanVaccines(ctx: ScanVaccinesContext): BuiltPrompt {
  const allPets = ctx.ownedPets;
  const multiPet = allPets.length > 1;
  const petNameInstruction = multiPet
    ? ` This account has these pets: ${allPets.map((p) => p.name).filter(Boolean).join(', ')}. For each vaccination, also include a "pet_name" field naming which of these pets it belongs to, if the document makes that clear (e.g. it's grouped under a pet's name, or this is a multi-pet invoice). If you can't tell which pet a line belongs to, omit "pet_name" rather than guessing.`
    : '';
  const prompt = `You are analyzing a veterinary document (e.g. an invoice or vaccine record) that may cover one or more pets. Extract ONLY vaccination line items — ignore medications, exam fees, boarding, grooming, supplies, and any other charge or record type, even if they appear on the same document. For each vaccination return: vaccine_name, date_given (YYYY-MM-DD), next_due_date (YYYY-MM-DD), administered_by (vet/clinic name), lot_number, notes. Only include fields clearly visible.${petNameInstruction}`;
  return { system: `${prompt}\n\n${jsonInstruction(SCAN_VACCINES_SCHEMA)}`, user: '', schema: SCAN_VACCINES_SCHEMA };
}

const SCAN_VACCINE_SINGLE_SCHEMA: JsonSchema = {
  type: 'object',
  properties: {
    vaccine_name: { type: 'string' },
    date_given: { type: 'string' },
    next_due_date: { type: 'string' },
    administered_by: { type: 'string' },
    lot_number: { type: 'string' },
  },
};

// onboarding/VaccinationEntryCard.jsx
export function buildScanVaccineSingle(): BuiltPrompt {
  const prompt = 'You are analyzing a photo of a single vaccination record or certificate. Extract only the fields clearly visible: vaccine_name, date_given (YYYY-MM-DD), next_due_date (YYYY-MM-DD), administered_by (vet/clinic name), lot_number.';
  return { system: `${prompt}\n\n${jsonInstruction(SCAN_VACCINE_SINGLE_SCHEMA)}`, user: '', schema: SCAN_VACCINE_SINGLE_SCHEMA };
}

const SCAN_MEDICATION_SCHEMA: JsonSchema = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    dosage: { type: 'string' },
    frequency: { type: 'string' },
  },
};

// onboarding/MedicationEntryCard.jsx
export function buildScanMedication(): BuiltPrompt {
  const prompt = 'You are analyzing a photo of a medication label. Extract only the fields clearly visible: name (the medication name), dosage (strength + amount per dose, e.g. "5mg"), frequency (how often it is given, matched to one of: Once daily, Twice daily, Every other day, Weekly, Monthly, As needed, Other).';
  return { system: `${prompt}\n\n${jsonInstruction(SCAN_MEDICATION_SCHEMA)}`, user: '', schema: SCAN_MEDICATION_SCHEMA };
}

// BloodworkSection.jsx
export function buildScanBloodwork(): BuiltPrompt {
  const fieldList = BLOODWORK_FIELDS.map((f) => `${f.key} (${f.label}, ${f.unit})`).join(', ');
  const prompt = `You are analyzing a veterinary bloodwork report (image or PDF). Extract all available values from this lab report. Return only a JSON object with these possible fields: date (YYYY-MM-DD), lab_name, vet_name, urine_specific_gravity, urine_protein (one of: Negative, Trace, 1+, 2+, 3+, 4+), notes, and numeric fields: ${fieldList}. Only include fields that are clearly visible in the document. Omit fields not present.`;
  const schema: JsonSchema = {
    type: 'object',
    properties: Object.fromEntries([
      ...BLOODWORK_FIELDS.map((f) => [f.key, { type: 'number' }]),
      ['date', { type: 'string' }],
      ['lab_name', { type: 'string' }],
      ['vet_name', { type: 'string' }],
      ['urine_specific_gravity', { type: 'string' }],
      ['urine_protein', { type: 'string' }],
      ['notes', { type: 'string' }],
    ]),
  };
  return { system: `${prompt}\n\n${jsonInstruction(schema)}`, user: '', schema };
}

// ---------------------------------------------------------------------------
// Request checks
// ---------------------------------------------------------------------------
export type TaskRequest =
  | { task: 'pet_chat'; pet_id: string; question: string; history: ChatMessage[]; screen: string | null }
  | { task: 'household_chat'; question: string; history: ChatMessage[] }
  | { task: 'pet_insights'; pet_id: string; screen: string | null }
  | { task: 'trends_summary'; pet_id: string; range: string }
  | { task: 'scan_vaccines'; pet_id: string; file_path: string }
  | { task: 'scan_vaccine_single'; pet_id: string | null; file_path: string }
  | { task: 'scan_medication'; pet_id: string | null; file_path: string }
  | { task: 'scan_bloodwork'; pet_id: string | null; file_path: string };

export interface TaskRequestError {
  status: 400;
  error: string;
  code: string;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}

export function isTaskName(value: unknown): value is TaskName {
  return typeof value === 'string' && (TASK_NAMES as readonly string[]).includes(value);
}

const refuse = (code: string, error: string): TaskRequestError => ({ status: 400, error, code });

export function isTaskRequestError(value: TaskRequest | TaskRequestError): value is TaskRequestError {
  return 'status' in value;
}

function parseQuestion(body: Record<string, unknown>): string | TaskRequestError {
  const q = body.question;
  if (typeof q !== 'string' || q.trim() === '') return refuse('invalid_question', 'question is required');
  if (q.length > MAX_QUESTION_CHARS) return refuse('invalid_question', `question must be ${MAX_QUESTION_CHARS} characters or fewer`);
  return q;
}

function parseHistory(body: Record<string, unknown>): ChatMessage[] | TaskRequestError {
  const h = body.history;
  if (h === undefined || h === null) return [];
  if (!Array.isArray(h)) return refuse('invalid_history', 'history must be an array');
  if (h.length > MAX_HISTORY_ENTRIES) return refuse('invalid_history', `history may have at most ${MAX_HISTORY_ENTRIES} messages`);
  const out: ChatMessage[] = [];
  for (const entry of h) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return refuse('invalid_history', 'history entries must be objects');
    const { role, content } = entry as Record<string, unknown>;
    if ((role !== 'user' && role !== 'assistant') || typeof content !== 'string') {
      return refuse('invalid_history', "history entries must be { role: 'user' | 'assistant', content: string }");
    }
    const max = role === 'user' ? MAX_OWNER_MESSAGE_CHARS : MAX_ASSISTANT_MESSAGE_CHARS;
    if (content.length > max) return refuse('invalid_history', `history ${role} messages must be ${max} characters or fewer`);
    out.push({ role, content });
  }
  return out;
}

function parsePetId(body: Record<string, unknown>, required: boolean): string | null | TaskRequestError {
  const id = body.pet_id;
  if (id === undefined || id === null) {
    return required ? refuse('invalid_pet_id', 'pet_id is required') : null;
  }
  if (!isUuid(id)) return refuse('invalid_pet_id', 'pet_id must be a UUID');
  return id;
}

function parseFilePath(body: Record<string, unknown>): string | TaskRequestError {
  // Only presence and type here. Whether the path is safe and the caller
  // may open it is checked in index.ts before anything is downloaded.
  const p = body.file_path;
  if (typeof p !== 'string' || p === '') return refuse('invalid_file', 'file_path is required');
  return p;
}

const isErr = (v: unknown): v is TaskRequestError =>
  typeof v === 'object' && v !== null && 'status' in v && 'code' in v;

// Turns a request body into a typed task request, or a 400 refusal. The
// app's old shape (its own `prompt` / `response_json_schema`) and the old
// `file_url` are refused outright (spec 0080 FR3, AC1, AC8).
export function parseTaskRequest(body: unknown): TaskRequest | TaskRequestError {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return refuse('unknown_task', 'Request must be a JSON object with a task');
  }
  const b = body as Record<string, unknown>;
  if ('prompt' in b || 'response_json_schema' in b) {
    return refuse('unknown_task', 'Requests may not include their own instructions');
  }
  if ('file_url' in b) {
    return refuse('invalid_file', 'Invalid file reference');
  }
  if (!isTaskName(b.task)) {
    return refuse('unknown_task', 'Unknown task');
  }

  let screen: string | null = null;
  if (b.screen !== undefined && b.screen !== null) {
    if (typeof b.screen !== 'string' || !PET_SCREEN_NAMES.includes(b.screen)) {
      return refuse('invalid_screen', 'Unknown screen');
    }
    screen = b.screen;
  }

  const task = b.task;
  switch (task) {
    case 'pet_chat': {
      const pet_id = parsePetId(b, true);
      if (isErr(pet_id)) return pet_id;
      const question = parseQuestion(b);
      if (isErr(question)) return question;
      const history = parseHistory(b);
      if (isErr(history)) return history;
      return { task, pet_id: pet_id as string, question, history, screen };
    }
    case 'household_chat': {
      const question = parseQuestion(b);
      if (isErr(question)) return question;
      const history = parseHistory(b);
      if (isErr(history)) return history;
      return { task, question, history };
    }
    case 'pet_insights': {
      const pet_id = parsePetId(b, true);
      if (isErr(pet_id)) return pet_id;
      return { task, pet_id: pet_id as string, screen };
    }
    case 'trends_summary': {
      const pet_id = parsePetId(b, true);
      if (isErr(pet_id)) return pet_id;
      if (typeof b.range !== 'string' || !TRENDS_RANGES.includes(b.range)) {
        return refuse('invalid_range', 'Unknown range');
      }
      return { task, pet_id: pet_id as string, range: b.range };
    }
    case 'scan_vaccines': {
      const pet_id = parsePetId(b, true);
      if (isErr(pet_id)) return pet_id;
      const file_path = parseFilePath(b);
      if (isErr(file_path)) return file_path;
      return { task, pet_id: pet_id as string, file_path };
    }
    case 'scan_vaccine_single':
    case 'scan_medication':
    case 'scan_bloodwork': {
      const pet_id = parsePetId(b, false);
      if (isErr(pet_id)) return pet_id;
      const file_path = parseFilePath(b);
      if (isErr(file_path)) return file_path;
      return { task, pet_id, file_path };
    }
  }
}

// ---------------------------------------------------------------------------
// Emergency hard stop and urgent backstop (spec 0041, enforced on the
// server by spec 0080 FR5)
// ---------------------------------------------------------------------------

// The matched emergency category, or null. Checked before any AI call.
export function emergencyStop(question: string | null | undefined): string | null {
  return detectEmergencyKeywords(question);
}

// If the AI flagged its answer as urgent, drop everything it wrote so the
// app can only show the fixed "contact your vet" message.
export function stripUrgent<T>(result: T): T | { urgent: true } {
  if (result && typeof result === 'object' && (result as Record<string, unknown>).urgent === true) {
    return { urgent: true };
  }
  return result;
}
