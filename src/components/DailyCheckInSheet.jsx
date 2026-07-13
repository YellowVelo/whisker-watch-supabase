import { useState, useEffect, useRef } from 'react';
import { X, Loader2 } from 'lucide-react';
import { CATEGORIES, getOptionsForSpecies, getCategory } from '@/lib/checkin/config';
import { markGreatDay, markSkipped, markOffTough } from '@/lib/checkin/checkinClient';
import { track } from '@/lib/analytics';
import { Textarea } from '@/components/ui/textarea';
import { PALETTE } from '@/lib/toneColors';

const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

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
export default function DailyCheckInSheet({ pet, date, onClose, onSaved, isCatchUp = false, existingCheckIn = null }) {
  const dialogRef = useRef(null);
  // isCatchUp doesn't just change analytics attribution — it drives the
  // "today" vs "yesterday" wording throughout this sheet, since a
  // catch-up save is for a past date and showing "today" language would
  // mislead the owner about which day they're logging (UX Principle:
  // "owners should always understand ... what information was used").
  const dayWord = isCatchUp ? 'yesterday' : 'today';
  const [stage, setStage] = useState('initial'); // initial | categories | details | saving
  const [selectedCodes, setSelectedCodes] = useState([]);
  const [answers, setAnswers] = useState({}); // code -> { value, numericValue, notes }
  const [error, setError] = useState(null);

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

  const handleGreatDay = async () => {
    setStage('saving');
    setError(null);
    try {
      track('daily_check_in_vibe_selected', { pet_id: pet.id, check_in_date: date, vibe: 'great' });
      await markGreatDay(pet.id, date);
      track('vibe_recorded', { pet_id: pet.id, check_in_date: date, status: 'great', symptom_count: 0 });
      onSaved?.();
    } catch (err) {
      console.error(err);
      setError('Unable to save check-in. Please try again.');
      setStage('initial');
    }
  };

  const startOffTough = (status) => {
    setVibeStatus(status);
    track('daily_check_in_vibe_selected', { pet_id: pet.id, check_in_date: date, vibe: status });
    setStage('categories');
  };

  const handleSkip = async () => {
    setStage('saving');
    setError(null);
    try {
      track('daily_check_in_skipped', { pet_id: pet.id, check_in_date: date });
      await markSkipped(pet.id, date);
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

  const handleSaveOffTough = async () => {
    if (incompleteCodes.length > 0) return;
    setStage('saving');
    setError(null);
    try {
      // Counted categories are multi-select — `values` is always passed
      // (even empty, meaning "confirmed normal"); checkinClient.js
      // resolves baseline rows for every counted category regardless, so
      // this is just carrying forward what the owner actually saw/
      // answered. Weight/Other only produce a selection if the owner
      // actually entered something.
      const selections = selectedCodes
        .map((code) => {
          const cat = getCategory(code);
          const a = answers[code] || {};
          if (cat.multiSelect) {
            return { code, values: a.values || [], notes: a.notes || null, photoUrl: a.photoUrl || null };
          }
          return { code, value: a.value ?? null, numericValue: a.numericValue ?? null, notes: a.notes || null };
        })
        .filter((sel) => sel.values !== undefined || sel.value != null || sel.numericValue != null || sel.notes);

      const { symptomCount } = await markOffTough(pet.id, date, vibeStatus, selections);
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

  // Accessibility: modal traps focus and is dismissible via Escape (Nav +
  // Daily Check-In UX Refresh spec — "Modal must trap focus" / "Modal must
  // be dismissible using expected keyboard behavior").
  useEffect(() => {
    const node = dialogRef.current;
    const focusables = () => Array.from(node?.querySelectorAll(FOCUSABLE) || []).filter((el) => !el.disabled);
    focusables()[0]?.focus();

    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        handleClose();
        return;
      }
      if (e.key !== 'Tab') return;
      const items = focusables();
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end" onClick={handleClose}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="daily-check-in-title"
        className="relative rounded-t-3xl shadow-2xl max-h-[85vh] flex flex-col"
        style={{ background: 'rgba(18,20,32,0.98)', border: '1px solid rgba(255,255,255,0.08)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 pt-5 pb-3 flex-shrink-0">
          <div className="w-10 h-1 bg-white/20 rounded-full mx-auto mb-4" />
          <div className="flex items-center justify-between">
            <h3 id="daily-check-in-title" className="text-xl font-bold text-white">
              {stage === 'initial' && `How was ${pet.name}'s day ${dayWord}?`}
              {stage === 'categories' && 'What happened?'}
              {(stage === 'details' || stage === 'saving') && 'A few details'}
            </h3>
            <button onClick={handleClose} aria-label="Close" className="h-9 w-9 rounded-full bg-white/8 flex items-center justify-center flex-shrink-0">
              <X className="h-4 w-4 text-white" />
            </button>
          </div>
          {error && <p className="text-sm text-red-400 mt-2">{error}</p>}
          {!error && stage === 'initial' && existingCheckIn?.status && (
            <p className="text-xs text-white/40 mt-2">
              Already logged as {{ great: 'Great Day', off: 'Off Day', tough: 'Tough Day', skipped: 'Skipped' }[existingCheckIn.status] || existingCheckIn.status} for {dayWord} — saving again will update it.
            </p>
          )}
        </div>

        <div className="px-5 overflow-y-auto flex-1 pb-2">
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
                const Icon = cat.icon;
                const active = selectedCodes.includes(cat.code);
                return (
                  <button
                    key={cat.code}
                    type="button"
                    aria-pressed={active}
                    onClick={() => toggleCategory(cat.code)}
                    className={`flex items-center gap-2 rounded-2xl px-3.5 py-3 text-sm font-semibold transition-all min-h-[48px] ${active ? 'text-background' : 'text-white/70 border border-white/12'}`}
                    style={active ? { background: PALETTE.sky, color: 'hsl(var(--background))' } : { background: 'rgba(255,255,255,0.05)' }}
                  >
                    <Icon className="h-4 w-4 flex-shrink-0" />
                    <span className="truncate">{cat.label}</span>
                  </button>
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
        </div>

        <div className="px-5 pt-3 pb-10 flex-shrink-0" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          {stage === 'categories' && (
            <button
              onClick={() => setStage('details')}
              className="w-full text-base font-bold rounded-2xl h-14 transition-opacity"
              style={{ background: PALETTE.sky, color: 'hsl(var(--background))' }}
            >
              Continue
            </button>
          )}
          {(stage === 'details' || stage === 'saving') && (
            <>
              {incompleteCodes.length > 0 && stage === 'details' && (
                <p className="text-xs text-white/40 mb-2 text-center">Answer each selected category to save</p>
              )}
              <button
                onClick={handleSaveOffTough}
                disabled={stage === 'saving' || incompleteCodes.length > 0}
                className="w-full flex items-center justify-center text-base font-bold rounded-2xl h-14 disabled:opacity-40 transition-opacity"
                style={{ background: PALETTE.sky, color: 'hsl(var(--background))' }}
              >
                {stage === 'saving' ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Saving…</> : 'Save check-in'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function BigChoiceButton({ label, onClick, subtle }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left rounded-2xl px-5 py-4 text-base font-semibold transition-all active:opacity-70 min-h-[56px]"
      style={subtle
        ? { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.6)' }
        : { background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: '#fff' }}
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
        <Icon className="h-4 w-4 text-white/50 flex-shrink-0" />
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
              <button
                key={opt.value}
                type="button"
                aria-pressed={active}
                onClick={handleClick}
                className={`text-sm px-3.5 py-2 rounded-full border transition-colors min-h-[40px] ${active ? '' : 'text-white/60 border-white/12'}`}
                style={active ? { background: PALETTE.sky, color: 'hsl(var(--background))', borderColor: PALETTE.sky } : { background: 'rgba(255,255,255,0.05)' }}
              >
                {opt.label}
              </button>
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
            className="w-32 rounded-xl px-3.5 py-2.5 text-sm font-semibold text-white bg-white/8 border border-white/10 focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <span className="text-xs text-white/40">lbs (optional)</span>
        </div>
      )}

      {category.answerType === 'text' && (
        <Textarea
          placeholder="Anything noteworthy..."
          value={answer.notes || ''}
          onChange={(e) => onChange({ notes: e.target.value })}
          rows={3}
          className="bg-white/5 border-white/10 text-white placeholder:text-white/30"
        />
      )}

      {category.hasNote && category.answerType === 'enum' && (
        <input
          type="text"
          placeholder="Add a note (optional)"
          value={answer.notes || ''}
          onChange={(e) => onChange({ notes: e.target.value })}
          className="w-full mt-2 rounded-xl px-3.5 py-2 text-sm text-white bg-white/5 border border-white/10 focus:outline-none focus:ring-1 focus:ring-primary placeholder:text-white/30"
        />
      )}

    </div>
  );
}
