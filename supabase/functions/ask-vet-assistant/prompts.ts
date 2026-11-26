// The AI instructions for ask-vet-assistant's 9 tasks (spec 0080, PA-11;
// the 9th, bloodwork_spreadsheet, is spec 0081's).
//
// Before spec 0080 the app wrote these instructions itself and the server
// passed them on, so anyone signed in could send their own. Now the app
// only names a task and sends ids and the owner's own words; the server
// builds the instructions here. The wording is copied from the 8 app call
// sites it replaces (PetAIChat, GeneralAskWyskerChat, PetAIInsights,
// trendsClient getInsightSummary, VaccinationSection,
// onboarding/VaccinationEntryCard, onboarding/MedicationEntryCard,
// BloodworkSection) and from src/lib/aiGuardrails.js. The two bloodwork
// tasks' instructions were rewritten by spec 0081 (FR29, FR35-FR37), and
// their answers are checked by ./bloodwork.ts before they go back.
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
//     for the scans (the file is the whole user message). For the
//     spreadsheet task, the spreadsheet text the app read (never in `system`).
//   - schema: the response shape, same as the app used to send.

import {
  BLOODWORK_FIELDS,
  URINE_PROTEIN_VALUES,
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
import { COUNTED_ATTRIBUTES, isCountableSymptom } from '../_shared/checkinRules.ts';

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
  'scan_bloodwork', // BloodworkSection (photo or PDF)
  'bloodwork_spreadsheet', // BloodworkSection (CSV or .xlsx, read by the app; spec 0081)
] as const;

export type TaskName = typeof TASK_NAMES[number];

export const TRENDS_RANGES: readonly string[] = ['24H', '7D', '30D', '90D', '1Y'];

export const MAX_QUESTION_CHARS = 2000;
// Spec 0081 FR32: longer spreadsheet text is refused before any AI call.
// Same limit as MAX_SHEET_TEXT_CHARS in src/lib/bloodworkSpreadsheet.js.
export const MAX_SHEET_TEXT_CHARS = 60_000;
// FR4: the chats send the AI only the last 20 messages. Longer chats keep
// working (older messages are dropped), but a history of more than
// MAX_INCOMING_HISTORY_ENTRIES entries is refused outright so a huge body
// never gets processed.
export const MAX_HISTORY_ENTRIES = 20;
export const MAX_INCOMING_HISTORY_ENTRIES = 200;
// Longer messages are cut to these lengths rather than refused, so a long
// earlier AI answer never breaks the rest of the chat.
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
// value (so baseline / "Not observed" answers can be told apart); `code` is
// the observation_types code (e.g. 'appetite'); `attribute` and `label` are
// the display names of the attribute and the chosen option.
export interface CheckInSymptom {
  code: string;
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

// One weight per day (the day's weight, _shared/weight.ts), in lbs rounded
// to one decimal (spec 0081).
export interface WeightEntry {
  date: string; // YYYY-MM-DD
  lbs: number;
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
// ignored, baseline / "Not observed" answers aren't symptoms, and only the
// 11 counted attributes (COUNTED_ATTRIBUTES) are listed.
export function describeCheckIns(checkIns: readonly CheckInDay[]): { vibes: string; symptoms: string } {
  const days = byDateDesc(checkIns);
  const vibes = days.map((d) => `${d.date}: ${d.status ? (VIBE_LABELS[d.status] || d.status) : 'Not recorded'}`).join('\n');
  const symptoms = days
    .filter((d) => d.status !== 'skipped')
    .map((d) => {
      const logged = d.symptoms.filter((s) => COUNTED_ATTRIBUTES.includes(s.code) && isCountableSymptom(s.value));
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
    .map((w) => `${w.date}: ${w.lbs.toFixed(1)} lbs`)
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

// ---------------------------------------------------------------------------
// Bloodwork (spec 0081, FR29, FR35-FR37). The scan and the spreadsheet
// task ask for the same answer, and ./bloodwork.ts checks it either way:
//   { visits: [{ date, lab_name, vet_name, notes, urine_specific_gravity,
//                urine_protein, values: { <field>: { value, unit } },
//                weight: { value, unit }, not_tracked: [names] }],
//     skipped: [{ date, field, value, unit }] }
// ---------------------------------------------------------------------------

const UNIT_SCHEMA: JsonSchema = { type: ['string', 'null'] };

export const BLOODWORK_ANSWER_SCHEMA: JsonSchema = {
  type: 'object',
  properties: {
    visits: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          date: { type: 'string' },
          lab_name: { type: 'string' },
          vet_name: { type: 'string' },
          notes: { type: 'string' },
          urine_specific_gravity: { type: 'string' },
          urine_protein: { type: 'string', enum: [...URINE_PROTEIN_VALUES] },
          values: {
            type: 'object',
            properties: Object.fromEntries(
              BLOODWORK_FIELDS.map((f) => [f.key, { type: 'object', properties: { value: { type: 'number' }, unit: UNIT_SCHEMA } }]),
            ),
          },
          weight: { type: 'object', properties: { value: { type: 'number' }, unit: UNIT_SCHEMA } },
          not_tracked: { type: 'array', items: { type: 'string' } },
        },
      },
    },
    skipped: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          date: { type: 'string' },
          field: { type: 'string' },
          value: { type: 'number' },
          unit: UNIT_SCHEMA,
        },
      },
    },
  },
};

// The 16 tracked tests, each with the only unit the app stores it in.
export function bloodworkFieldList(): string {
  return BLOODWORK_FIELDS.map((f) => `${f.key} (${f.label}, ${f.unit})`).join(', ');
}

// The reading rules both bloodwork tasks share, one per line.
export const BLOODWORK_READING_RULES: readonly string[] = [
  `For each visit, report each of these 16 tracked tests you find in "values", keyed by the field name, as { "value": <number>, "unit": <the unit exactly as written in the document, or null if no unit is stated anywhere for it> }: ${bloodworkFieldList()}.`,
  'Never convert a value to another unit. If a tracked test is reported in a different unit from the one listed (for example creatinine in µmol/L instead of mg/dL, or glucose in mmol/L instead of mg/dL), leave it out of "values" and add it to "skipped" as { "date", "field", "value", "unit" }, with the unit exactly as written.',
  'Only report a value that is one plain number. Leave out values such as "<5", ">1000", "N/A", "see comment" or blank cells.',
  'Reference ranges ("Range", "Reference", "Ref. interval", "Normal") and unit labels ("Measure", "Units") are labels for a test, never results: never report a number from them as a value.',
  `Also report, when present: date (the visit or sample date, YYYY-MM-DD), lab_name, vet_name, urine_specific_gravity, urine_protein (one of: ${URINE_PROTEIN_VALUES.join(', ')}), and notes (only comments written about the results).`,
  'Weight: if the visit records the pet\'s weight with a stated unit (for example lbs or kg), report it as "weight": { "value": <number>, "unit": <the unit as written> }. If a weight has no stated unit, leave it out of the visit and add it to "skipped" with "field": "weight" and "unit": null.',
  'In "not_tracked", list once per visit the names (as written) of any other lab tests reported for that visit that are not among the 16 above, for example chloride, globulin, GGT, bilirubin, cholesterol, amylase, lipase, CK, blood count details, other urine tests or blood pressure.',
  'Ignore treatments, fluids, medications, supplements, diet, procedures, charges and anything else that is not a lab result: never report them anywhere, not even in "not_tracked".',
  'Only include what is clearly present. Omit fields that are not present. If there are no bloodwork results at all, return { "visits": [], "skipped": [] }.',
];

const rulesList = (rules: readonly string[]) => rules.map((r) => `- ${r}`).join('\n');

// BloodworkSection.jsx: Upload File with a photo or PDF (FR35).
export function buildScanBloodwork(): BuiltPrompt {
  const prompt = `You are analyzing a veterinary bloodwork report (image or PDF). It may show more than one visit, for example earlier results printed in columns beside the latest ones. Report each visit (one set of results on one date) as its own entry in "visits".

Rules:
${rulesList(BLOODWORK_READING_RULES)}`;
  return { system: `${prompt}\n\n${jsonInstruction(BLOODWORK_ANSWER_SCHEMA)}`, user: '', schema: BLOODWORK_ANSWER_SCHEMA };
}

// The spreadsheet-only rules (FR37), before the shared ones.
export const SPREADSHEET_LAYOUT_RULES: readonly string[] = [
  'The layout may be one row per visit (tests across the columns) or one row per test (visits across the columns, often newest on the left, with the date and weight rows above the tests). Work out which from the headers and labels.',
  'A workbook may have several near-identical sheets that repeat the same visits. If the same date appears on more than one sheet with the same results, report that visit once. If the same date appears with different results, report each version as a separate visit; never choose between them or combine them.',
];

// BloodworkSection.jsx: Upload File with a CSV or .xlsx (FR28, FR37). The
// app reads the file into text (src/lib/bloodworkSpreadsheet.js); the text
// is the owner's own content, so it goes in `user`, never in `system`.
export function buildBloodworkSpreadsheet(sheetText: string): BuiltPrompt {
  const prompt = `You are reading a pet owner's own veterinary bloodwork spreadsheet. The user message is the spreadsheet as plain text: each sheet starts with a line "Sheet N of M: <sheet name>", followed by that sheet's rows, one per line, as comma-separated cells (a cell containing a comma or quote is in double quotes), in the sheet's own layout. Empty cells are kept, so every value stays under its column.

Find every visit (one set of lab results on one date) and report each as its own entry in "visits".

Rules:
${rulesList([...SPREADSHEET_LAYOUT_RULES, ...BLOODWORK_READING_RULES])}`;
  return {
    system: `${prompt}\n\n${jsonInstruction(BLOODWORK_ANSWER_SCHEMA)}`,
    user: `The spreadsheet:\n\n${sheetText}`,
    schema: BLOODWORK_ANSWER_SCHEMA,
  };
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
  | { task: 'scan_bloodwork'; pet_id: string | null; file_path: string }
  | { task: 'bloodwork_spreadsheet'; pet_id: string; sheet_text: string };

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

// FR4: history is optional. Entries that aren't { role: 'user' |
// 'assistant', content: non-empty string } are dropped (the app keeps
// emergency and error bubbles in the chat with no content), each message
// is cut to its length limit, and only the last MAX_HISTORY_ENTRIES are
// kept. Only a non-array or an oversized array is refused.
function parseHistory(body: Record<string, unknown>): ChatMessage[] | TaskRequestError {
  const h = body.history;
  if (h === undefined || h === null) return [];
  if (!Array.isArray(h)) return refuse('invalid_history', 'history must be an array');
  if (h.length > MAX_INCOMING_HISTORY_ENTRIES) {
    return refuse('invalid_history', `history may have at most ${MAX_INCOMING_HISTORY_ENTRIES} messages`);
  }
  const out: ChatMessage[] = [];
  for (const entry of h) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const { role, content } = entry as Record<string, unknown>;
    if ((role !== 'user' && role !== 'assistant') || typeof content !== 'string' || content.trim() === '') continue;
    const max = role === 'user' ? MAX_OWNER_MESSAGE_CHARS : MAX_ASSISTANT_MESSAGE_CHARS;
    out.push({ role, content: content.slice(0, max) });
  }
  return out.slice(-MAX_HISTORY_ENTRIES);
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

function parseSheetText(body: Record<string, unknown>): string | TaskRequestError {
  const t = body.sheet_text;
  if (typeof t !== 'string' || t.trim() === '') return refuse('invalid_sheet_text', 'sheet_text is required');
  if (t.length > MAX_SHEET_TEXT_CHARS) {
    return refuse('sheet_too_large', `sheet_text must be ${MAX_SHEET_TEXT_CHARS} characters or fewer`);
  }
  return t;
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
    case 'bloodwork_spreadsheet': {
      const pet_id = parsePetId(b, true);
      if (isErr(pet_id)) return pet_id;
      const sheet_text = parseSheetText(b);
      if (isErr(sheet_text)) return sheet_text;
      return { task, pet_id: pet_id as string, sheet_text };
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
// app can only show the fixed "contact your vet" message. Any truthy
// `urgent` counts, matching the app's own `if (result?.urgent)` check.
export function stripUrgent<T>(result: T): T | { urgent: true } {
  if (result && typeof result === 'object' && (result as Record<string, unknown>).urgent) {
    return { urgent: true };
  }
  return result;
}
