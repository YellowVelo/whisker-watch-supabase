import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { CATEGORIES, getOptionsForSpecies, getCategory } from '@/lib/checkin/config';
import { markGreatDay, markSkipped, markOffTough, loadObservationCatalog, describeObservation } from '@/lib/checkin/checkinClient';
import { entities } from '@/api/entities';
import { track } from '@/lib/analytics';
import { Textarea } from '@/components/ui/textarea';
import { PALETTE } from '@/lib/toneColors';
import PillToggle from '@/components/PillToggle';
import BottomSheet from '@/components/BottomSheet';

const VIBE_LABELS = { great: 'Great Day', off: 'Off Day', tough: 'Tough Day', skipped: 'Skipped' };

// Co-owner conflict detection (spec 0043) — turns the raw conflict payload
// save_daily_check_ins hands back into what the "someone else already
// saved this" pop-up needs: which co-owner, and a plain-language summary
// of what they saved. `describeObservation` already existed for exactly
// this per-row "what changed" translation but had no real caller before
// this — it's the same logic buildObservationRows uses to decide what a
// symptom row means, just read back out.
async function resolveConflictSummary(pet, existingCheckIn, existingObservations) {
  const [coOwners, catalog] = await Promise.all([
    entities.PetCoOwner.filter({ pet_id: pet.id }).catch(() => []),
    loadObservationCatalog(),
  ]);
  const coOwner = coOwners.find((c) => c.co_owner_user_id === existingCheckIn.created_by);
  const who = coOwner?.co_owner_email || 'Your co-owner';

  const typeIdToCode = {};
  for (const [code, entry] of Object.entries(catalog)) typeIdToCode[entry.type.id] = code;
  const symptoms = (existingObservations || [])
    .map((obs) => describeObservation(obs, typeIdToCode))
    .filter(Boolean);

  return { who, vibeLabel: VIBE_LABELS[existingCheckIn.status] || existingCheckIn.status, symptoms };
}

// Medication Exception is deferred out of this round's picker (spec:
// "not shown in this round's check-in flow ... category is not removed
// from the data model — only from this round's UI"). Weight and Other are
// untouched — they were never counted categories and stay exactly where
// they were.
const PICKER_CATEGORIES = CATEGORIES.filter((c) => c.code !== 'medication_exception');

// Bottom-sheet Daily Check-In flow: "How are things today?" -> (Off Day /
// Tough Day) category picker -> only the relevant follow-up questions ->
// save. Deliberately not a multi-page wizard — everything after category
// selection lives in one scrollable sheet so an Off/Tough Day check-in
// stays fast, per "Minimize typing" / "one interaction over many".
//
// Great Day, Off Day, and Tough Day (spec v5 Core Model I) replace the
// prior Normal/Changed binary. Great Day saves immediately, identical to
// the old "normal" path. Off Day and Tough Day both open the same
// category picker and follow-up flow — nothing about save behavior
// distinguishes them beyond which label gets stored (spec: "Both are
// equally real, equally complete data points").
//
// `isCatchUp` distinguishes a catch-up-for-a-past-date save from a normal
// today save purely for analytics attribution (catch_up_completed vs the
// regular events) — it doesn't change any persistence behavior.
// `confirmBeforeSave` (spec 0060): the Check-In History calendar reopens
// an already-saved, possibly-long-past day, where a mistaken overwrite is
// harder to notice and correct than the same-day case spec 0026 covers —
// so unlike every other caller of this sheet, saving from History pauses
// on a "Save changes to {day}?" confirmation instead of writing
// immediately. Today's edit (spec 0026) and Catch-Up (spec 0015) both
// deliberately keep the no-confirmation behavior they already had.
export default function DailyCheckInSheet({ pet, date, onClose, onSaved, isCatchUp = false, existingCheckIn = null, dayLabel = null, confirmBeforeSave = false }) {
  // isCatchUp doesn't just change analytics attribution — it drives the
  // "today" vs "yesterday" wording throughout this sheet, since a
  // catch-up save is for a past date and showing "today" language would
  // mislead the owner about which day they're logging (UX Principle:
  // "owners should always understand ... what information was used").
  // `dayLabel` overrides that default for multi-day Catch Up (spec 0015),
  // where the date being detailed usually isn't yesterday at all — a
  // hardcoded "yesterday" would actively mislead the owner about which of
  // several missed days they're looking at, so the caller supplies the
  // actual formatted date (e.g. "Jul 14") instead.
  const dayWord = dayLabel || (isCatchUp ? 'yesterday' : 'today');
  const [stage, setStage] = useState('initial'); // initial | categories | details | saving
  const [selectedCodes, setSelectedCodes] = useState([]);
  const [answers, setAnswers] = useState({}); // code -> { value, numericValue, notes }
  const [error, setError] = useState(null);
  // Co-owner conflict detection (spec 0043) — set when the save was
  // refused because a different co-owner already saved a newer version of
  // this day; null the rest of the time. Distinct from `error`, which is
  // for actual failures — a conflict is an expected, handled outcome.
  const [conflict, setConflict] = useState(null);

  // Set only when confirmBeforeSave is true (spec 0060) — holds the actual
  // save action until the owner confirms it in the sheet below, instead of
  // running it immediately the way every other caller of this sheet does.
  const [pendingSave, setPendingSave] = useState(null); // { run: () => void, vibeLabel: string } | null

  // 'off' | 'tough' while the picker/details flow is in progress, so the
  // eventual save knows which Vibe to store.
  const [vibeStatus, setVibeStatus] = useState(null);

  const setAnswer = (code, patch) => setAnswers((a) => ({ ...a, [code]: { ...a[code], ...patch } }));

  // Only enum-answer categories require a selected option before the
  // check-in can be saved — Weight (number) and Other (text) are optional
  // even once picked. Multi-select (every counted category) is complete
  // once `values` is an actual array (even empty — "Normal" is an
  // explicit choice), not just present-but-undefined (untouched).
  const incompleteCodes = selectedCodes.filter((code) => {
    const cat = getCategory(code);
    if (cat.answerType !== 'enum') return false;
    return cat.multiSelect ? answers[code]?.values === undefined : !answers[code]?.value;
  });

  // Gates a save action behind the confirmation sheet when confirmBeforeSave
  // is set (spec 0060); every other caller runs it immediately, unchanged.
  const requestSave = (run, vibeLabel) => {
    if (confirmBeforeSave) { setPendingSave({ run, vibeLabel }); return; }
    run();
  };

  const handleGreatDay = () => requestSave(doSaveGreatDay, 'Great Day');

  const doSaveGreatDay = async () => {
    setStage('saving');
    setError(null);
    try {
      track('daily_check_in_vibe_selected', { pet_id: pet.id, check_in_date: date, vibe: 'great' });
      const result = await markGreatDay(pet.id, date, isCatchUp ? 'catch_up' : 'app', { expectedUpdatedAt: existingCheckIn?.updated_at ?? null });
      if (result.conflict) {
        await showConflict(result);
        return;
      }
      track('vibe_recorded', { pet_id: pet.id, check_in_date: date, status: 'great', symptom_count: 0 });
      onSaved?.();
    } catch (err) {
      console.error(err);
      setError('Unable to save check-in. Please try again.');
      setStage('initial');
    }
  };

  // Co-owner conflict detection (spec 0043) — a save was refused because
  // Co-Owner B's save landed since this device loaded the day. Resolves
  // who/what for the pop-up, then hands control to it instead of closing.
  const showConflict = async (result) => {
    const summary = await resolveConflictSummary(pet, result.existingCheckIn, result.existingObservations);
    setConflict({ ...summary, existingCheckIn: result.existingCheckIn });
    setStage('initial');
  };

  const handleKeepMine = async () => {
    if (!conflict) return;
    setStage('saving');
    const retryExpectedUpdatedAt = conflict.existingCheckIn.updated_at;
    setConflict(null);
    try {
      const result = vibeStatus
        ? await markOffTough(pet.id, date, vibeStatus, buildSelections(), isCatchUp ? 'catch_up' : 'app', { expectedUpdatedAt: retryExpectedUpdatedAt })
        : await markGreatDay(pet.id, date, isCatchUp ? 'catch_up' : 'app', { expectedUpdatedAt: retryExpectedUpdatedAt });
      if (result.conflict) {
        // Another save landed in the few seconds since the pop-up showed —
        // rare, but handled the same way: show the newer conflict instead
        // of silently retrying forever.
        await showConflict(result);
        return;
      }
      onSaved?.();
    } catch (err) {
      console.error(err);
      setError('Unable to save check-in. Please try again.');
      setStage(vibeStatus ? 'details' : 'initial');
    }
  };

  // "Keep Theirs" (spec 0043, decided): discard this device's in-progress
  // edit outright and let the parent re-load the co-owner's saved entry —
  // no merge, no further screen.
  const handleKeepTheirs = () => {
    setConflict(null);
    onSaved?.();
  };

  const startOffTough = (status) => {
    setVibeStatus(status);
    track('daily_check_in_vibe_selected', { pet_id: pet.id, check_in_date: date, vibe: status });
    setStage('categories');
  };

  const handleSkip = () => requestSave(doSkip, 'Skipped');

  const doSkip = async () => {
    setStage('saving');
    setError(null);
    try {
      track('daily_check_in_skipped', { pet_id: pet.id, check_in_date: date });
      await markSkipped(pet.id, date, isCatchUp ? 'catch_up' : 'app');
      onSaved?.();
    } catch (err) {
      console.error(err);
      setError('Unable to save check-in. Please try again.');
      setStage('initial');
    }
  };

  const toggleCategory = (code) => {
    setSelectedCodes((codes) => {
      const next = codes.includes(code) ? codes.filter((c) => c !== code) : [...codes, code];
      if (!codes.includes(code)) track('observation_category_selected', { pet_id: pet.id, category: code });
      return next;
    });
  };

  // Counted categories are multi-select — `values` is always passed (even
  // empty, meaning "confirmed normal"); checkinClient.js resolves baseline
  // rows for every counted category regardless, so this is just carrying
  // forward what the owner actually saw/answered. Weight/Other only
  // produce a selection if the owner actually entered something. Shared
  // by the normal save and the "Keep Mine" conflict-retry (spec 0043),
  // which needs the exact same selection set re-sent, not recomputed.
  const buildSelections = () => selectedCodes
    .map((code) => {
      const cat = getCategory(code);
      const a = answers[code] || {};
      if (cat.multiSelect) {
        return { code, values: a.values || [], notes: a.notes || null, photoUrl: a.photoUrl || null };
      }
      return { code, value: a.value ?? null, numericValue: a.numericValue ?? null, notes: a.notes || null };
    })
    .filter((sel) => sel.values !== undefined || sel.value != null || sel.numericValue != null || sel.notes);

  const handleSaveOffTough = () => {
    if (incompleteCodes.length > 0) return;
    requestSave(doSaveOffTough, VIBE_LABELS[vibeStatus] || vibeStatus);
  };

  const doSaveOffTough = async () => {
    setStage('saving');
    setError(null);
    try {
      const selections = buildSelections();
      const result = await markOffTough(pet.id, date, vibeStatus, selections, isCatchUp ? 'catch_up' : 'app', { expectedUpdatedAt: existingCheckIn?.updated_at ?? null });
      if (result.conflict) {
        await showConflict(result);
        return;
      }
      const { symptomCount } = result;
      track('observation_saved', { pet_id: pet.id, check_in_date: date, categories: selectedCodes });
      track('vibe_recorded', { pet_id: pet.id, check_in_date: date, status: vibeStatus, symptom_count: symptomCount });
      if (isCatchUp) track('catch_up_completed', { pet_id: pet.id, check_in_date: date, status: vibeStatus });
      onSaved?.();
    } catch (err) {
      console.error(err);
      setError('Unable to save check-in. Please try again.');
      setStage('details');
    }
  };

  const handleClose = () => {
    if (stage !== 'saving') track('check_in_abandoned', { pet_id: pet.id, check_in_date: date, stage });
    onClose();
  };

  const title = (
    <>
      {stage === 'initial' && `How was ${pet.name}'s day ${dayWord}?`}
      {stage === 'categories' && 'What happened?'}
      {(stage === 'details' || stage === 'saving') && 'A few details'}
    </>
  );

  const subtitle = (
    <>
      {error && <p className="text-sm text-red-400 mt-2">{error}</p>}
      {!error && stage === 'initial' && existingCheckIn?.status && (
        <p className="text-[13px] text-tier-tertiary mt-2">
          Already logged as {VIBE_LABELS[existingCheckIn.status] || existingCheckIn.status} for {dayWord} — saving again will update it.
        </p>
      )}
    </>
  );

  const footer = (stage === 'categories' || stage === 'details' || stage === 'saving') ? (
    <>
      {stage === 'categories' && (
        <button
          onClick={() => setStage('details')}
          className="w-full text-base font-bold rounded-2xl h-14 transition-opacity border-2"
          style={{ background: 'hsl(var(--background))', borderColor: PALETTE.sky, color: '#fff' }}
        >
          Continue
        </button>
      )}
      {(stage === 'details' || stage === 'saving') && (
        <>
          {incompleteCodes.length > 0 && stage === 'details' && (
            <p className="text-[13px] text-tier-tertiary mb-2 text-center">Answer each selected category to save</p>
          )}
          <button
            onClick={handleSaveOffTough}
            disabled={stage === 'saving' || incompleteCodes.length > 0}
            className="w-full flex items-center justify-center text-base font-bold rounded-2xl h-14 disabled:opacity-40 transition-opacity border-2"
            style={{ background: 'hsl(var(--background))', borderColor: PALETTE.sky, color: '#fff' }}
          >
            {stage === 'saving' ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Saving…</> : 'Save check-in'}
          </button>
        </>
      )}
    </>
  ) : null;

  // History-calendar confirmation (spec 0060) — pauses the save until the
  // owner explicitly confirms overwriting a past day, unlike every other
  // caller of this sheet.
  if (pendingSave) {
    return (
      <BottomSheet
        titleId="check-in-confirm-title"
        title={`Save changes to ${dayLabel || dayWord}?`}
        onClose={handleClose}
        footer={(
          <div className="flex gap-3">
            <button
              onClick={() => setPendingSave(null)}
              className="flex-1 text-base font-bold rounded-2xl h-14 transition-opacity border-2 bg-card"
              style={{ borderColor: PALETTE.gray, color: 'var(--text-secondary)' }}
            >
              Cancel
            </button>
            <button
              onClick={() => { const { run } = pendingSave; setPendingSave(null); run(); }}
              className="flex-1 text-base font-bold rounded-2xl h-14 transition-opacity border-2"
              style={{ background: 'hsl(var(--background))', borderColor: PALETTE.sky, color: '#fff' }}
            >
              Save
            </button>
          </div>
        )}
      >
        <p className="text-sm text-white pb-2">
          This will set {dayLabel || dayWord} to {pendingSave.vibeLabel}.
        </p>
      </BottomSheet>
    );
  }

  // Co-owner conflict (spec 0043) takes over the sheet entirely — the
  // owner must resolve it before doing anything else with this check-in.
  if (conflict) {
    return (
      <BottomSheet
        titleId="check-in-conflict-title"
        title="Someone already saved this day"
        onClose={handleClose}
        footer={(
          <div className="flex gap-3">
            <button
              onClick={handleKeepTheirs}
              className="flex-1 text-base font-bold rounded-2xl h-14 transition-opacity border-2 bg-card"
              style={{ borderColor: PALETTE.gray, color: 'var(--text-secondary)' }}
            >
              Keep Theirs
            </button>
            <button
              onClick={handleKeepMine}
              className="flex-1 text-base font-bold rounded-2xl h-14 transition-opacity border-2"
              style={{ background: 'hsl(var(--background))', borderColor: PALETTE.sky, color: '#fff' }}
            >
              Keep Mine
            </button>
          </div>
        )}
      >
        <p className="text-sm text-white pb-2">
          {conflict.who} already saved {dayWord} as {conflict.vibeLabel}
          {conflict.symptoms.length > 0 ? ` (${conflict.symptoms.join(', ')})` : ''}.
        </p>
        <p className="text-[13px] text-tier-tertiary pb-2">
          Choose whether to keep what you were entering, or keep {conflict.who === 'Your co-owner' ? 'their' : `${conflict.who}'s`} saved answer instead.
        </p>
      </BottomSheet>
    );
  }

  return (
    <BottomSheet titleId="daily-check-in-title" title={title} subtitle={subtitle} onClose={handleClose} footer={footer} focusKey={stage}>
      {stage === 'initial' && (
        <div className="space-y-3 pb-2">
          <BigChoiceButton label="Great Day" onClick={handleGreatDay} />
          <BigChoiceButton label="Off Day" onClick={() => startOffTough('off')} />
          <BigChoiceButton label="Tough Day" onClick={() => startOffTough('tough')} />
          <BigChoiceButton label={`Skip ${dayWord}`} subtle onClick={handleSkip} />
        </div>
      )}

      {stage === 'categories' && (
        <div className="grid grid-cols-2 gap-2 pb-2">
          {PICKER_CATEGORIES.map((cat) => {
            const active = selectedCodes.includes(cat.code);
            return (
              <PillToggle
                key={cat.code}
                active={active}
                onClick={() => toggleCategory(cat.code)}
                icon={cat.icon}
                className="justify-start rounded-2xl px-3.5 py-3 text-sm"
              >
                <span className="truncate">{cat.label}</span>
              </PillToggle>
            );
          })}
        </div>
      )}

      {(stage === 'details' || stage === 'saving') && (
        <div className="space-y-6 pb-2">
          {selectedCodes.map((code) => (
            <CategoryQuestion
              key={code}
              category={CATEGORIES.find((c) => c.code === code)}
              species={pet.species}
              petName={pet.name}
              dayWord={dayWord}
              answer={answers[code] || {}}
              onChange={(patch) => setAnswer(code, patch)}
            />
          ))}
        </div>
      )}
    </BottomSheet>
  );
}

function BigChoiceButton({ label, onClick, subtle = false }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left rounded-2xl px-5 py-4 text-base font-semibold transition-all active:opacity-70 min-h-[56px] bg-card border border-border"
      style={{ color: subtle ? 'var(--text-secondary)' : '#fff' }}
    >
      {label}
    </button>
  );
}

function CategoryQuestion({ category, species, petName, dayWord, answer, onChange }) {
  const Icon = category.icon;

  return (
    <div>
      <div className="flex items-center gap-2 mb-2.5">
        <Icon className="h-4 w-4 text-tier-tertiary flex-shrink-0" />
        <p className="text-sm font-semibold text-white">{category.question(petName, species, dayWord)}</p>
      </div>

      {category.answerType === 'enum' && (
        <div className="flex flex-wrap gap-2">
          {getOptionsForSpecies(category, species).map((opt) => {
            const isBaseline = opt.value === 'normal' || opt.value === 'none' || opt.value === 'no_change';
            const selectedValues = category.multiSelect ? (answer.values || []) : [];
            const active = category.multiSelect
              ? (isBaseline ? (answer.values !== undefined && selectedValues.length === 0) : selectedValues.includes(opt.value))
              : answer.value === opt.value;

            const handleClick = () => {
              if (!category.multiSelect) {
                onChange({ value: opt.value });
                return;
              }
              // "Normal" clears every other symptom for this category
              // (mutually exclusive); picking a symptom toggles it in the
              // set — multiple symptoms can be logged for one category the
              // same day, each carrying equal weight.
              if (isBaseline) {
                onChange({ values: [] });
                return;
              }
              const next = selectedValues.includes(opt.value)
                ? selectedValues.filter((v) => v !== opt.value)
                : [...selectedValues, opt.value];
              onChange({ values: next });
            };

            return (
              <PillToggle
                key={opt.value}
                active={active}
                onClick={handleClick}
                className="text-sm px-3.5 py-2 min-h-[40px]"
              >
                {opt.label}
              </PillToggle>
            );
          })}
        </div>
      )}

      {category.answerType === 'number' && (
        <div className="flex items-center gap-3">
          <input
            type="number"
            step="0.1"
            placeholder="Weight"
            value={answer.numericValue ?? ''}
            onChange={(e) => onChange({ numericValue: e.target.value === '' ? null : parseFloat(e.target.value) })}
            className="w-32 rounded-xl px-3.5 py-2.5 text-sm font-semibold text-white bg-card border border-border focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <span className="text-[13px] text-tier-tertiary">lbs (optional)</span>
        </div>
      )}

      {category.answerType === 'text' && (
        <Textarea
          placeholder="Anything noteworthy..."
          value={answer.notes || ''}
          onChange={(e) => onChange({ notes: e.target.value })}
          rows={3}
          className="bg-card border-border text-white placeholder:text-tier-tertiary"
        />
      )}

      {category.hasNote && category.answerType === 'enum' && (
        <input
          type="text"
          placeholder="Add a note (optional)"
          value={answer.notes || ''}
          onChange={(e) => onChange({ notes: e.target.value })}
          className="w-full mt-2 rounded-xl px-3.5 py-2 text-sm text-white bg-white/5 border border-white/10 focus:outline-none focus:ring-1 focus:ring-primary placeholder:text-tier-tertiary"
        />
      )}

    </div>
  );
}
