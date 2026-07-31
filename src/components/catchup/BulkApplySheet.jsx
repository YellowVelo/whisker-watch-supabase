import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { CATEGORIES, getOptionsForSpecies, getCategory } from '@/lib/checkin/config';
import { markOffToughBulk } from '@/lib/checkin/checkinClient';
import { track } from '@/lib/analytics';
import { Textarea } from '@/components/ui/textarea';
import { PALETTE } from '@/lib/toneColors';
import PillToggle from '@/components/PillToggle';
import BottomSheet from '@/components/BottomSheet';

const PICKER_CATEGORIES = CATEGORIES.filter((c) => c.code !== 'medication_exception');

// Catch Up's (spec 0015) bulk-apply — "if several consecutive days all had
// the same issue, apply one set of answers to all of them at once instead
// of repeating yourself". Deliberately a separate, trimmed component
// rather than a DailyCheckInSheet prop variant: DailyCheckInSheet's save
// path is tied to a single date end-to-end (state, analytics, the
// isCatchUp/dayLabel wording), and threading "N dates instead of 1"
// through all of that would risk the single-day path more than it's worth
// for what's structurally a different flow — this only ever writes Off/
// Tough Day details (a bulk-flagged day is never "Great" by definition,
// so that choice and Skip are both out of scope here), applying the exact
// same selections to every date via markOffToughBulk (spec 0016), which
// writes each date's row atomically in chunks of 20 so every day still
// gets its own independent, correct row (spec: "each of those days gets
// its own independent, correct record — not one shared row").
export default function BulkApplySheet({ pet, dates, onClose, onSaved }) {
  const [stage, setStage] = useState('vibe'); // vibe | categories | details | saving
  const [vibeStatus, setVibeStatus] = useState(null);
  const [selectedCodes, setSelectedCodes] = useState([]);
  const [answers, setAnswers] = useState({});
  const [error, setError] = useState(null);

  const setAnswer = (code, patch) => setAnswers((a) => ({ ...a, [code]: { ...a[code], ...patch } }));

  const incompleteCodes = selectedCodes.filter((code) => {
    const cat = getCategory(code);
    if (cat.answerType !== 'enum') return false;
    return cat.multiSelect ? answers[code]?.values === undefined : !answers[code]?.value;
  });

  const chooseVibe = (status) => {
    setVibeStatus(status);
    setStage('categories');
  };

  const toggleCategory = (code) => {
    setSelectedCodes((codes) => (codes.includes(code) ? codes.filter((c) => c !== code) : [...codes, code]));
  };

  const handleSave = async () => {
    if (incompleteCodes.length > 0) return;
    setStage('saving');
    setError(null);
    try {
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

      // One atomic call per chunk of 20 dates (spec 0016), sequential, not
      // parallel, so a partial failure is easy to reason about: dates in
      // chunks before the failure are saved for real, the failed chunk (and
      // anything after) is not.
      await markOffToughBulk(pet.id, dates, vibeStatus, selections, 'catch_up');
      track('multi_day_catch_up_bulk_applied', { pet_id: pet.id, status: vibeStatus, dates_count: dates.length, categories: selectedCodes });
      onSaved?.(dates);
    } catch (err) {
      console.error(err);
      setError('Unable to save some of these days. Please try again.');
      setStage('details');
    }
  };

  const handleClose = () => {
    if (stage !== 'saving') track('multi_day_catch_up_bulk_apply_abandoned', { pet_id: pet.id, dates_count: dates.length, stage });
    onClose();
  };

  const title = (
    <>
      {stage === 'vibe' && `Apply to ${dates.length} days`}
      {stage === 'categories' && 'What changed?'}
      {(stage === 'details' || stage === 'saving') && 'A few details'}
    </>
  );

  const subtitle = (
    <>
      {error && <p className="text-sm text-red-400 mt-2">{error}</p>}
      {!error && stage === 'vibe' && (
        <p className="text-xs text-tier-tertiary mt-2">Pick what these {dates.length} days had in common — each day still gets saved on its own.</p>
      )}
    </>
  );

  const footer = (stage === 'categories' || stage === 'details' || stage === 'saving') ? (
    <>
      {stage === 'categories' && (
        <button
          onClick={() => setStage('details')}
          disabled={selectedCodes.length === 0}
          className="w-full text-base font-bold rounded-2xl h-14 disabled:opacity-40 transition-opacity border-2"
          style={{ background: 'hsl(var(--background))', borderColor: PALETTE.sky, color: '#fff' }}
        >
          Continue
        </button>
      )}
      {(stage === 'details' || stage === 'saving') && (
        <>
          {incompleteCodes.length > 0 && stage === 'details' && (
            <p className="text-xs text-tier-tertiary mb-2 text-center">Answer each selected category to save</p>
          )}
          <button
            onClick={handleSave}
            disabled={stage === 'saving' || incompleteCodes.length > 0}
            className="w-full flex items-center justify-center text-base font-bold rounded-2xl h-14 disabled:opacity-40 transition-opacity border-2"
            style={{ background: 'hsl(var(--background))', borderColor: PALETTE.sky, color: '#fff' }}
          >
            {stage === 'saving' ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Saving {dates.length} days…</> : `Save to ${dates.length} days`}
          </button>
        </>
      )}
    </>
  ) : null;

  return (
    <BottomSheet titleId="bulk-apply-title" title={title} subtitle={subtitle} onClose={handleClose} footer={footer} focusKey={stage}>
      {stage === 'vibe' && (
        <div className="space-y-3 pb-2">
          <button
            type="button"
            onClick={() => chooseVibe('off')}
            className="w-full text-left rounded-2xl px-5 py-4 text-base font-semibold min-h-[56px] bg-card border border-border text-white"
          >
            Off Day
          </button>
          <button
            type="button"
            onClick={() => chooseVibe('tough')}
            className="w-full text-left rounded-2xl px-5 py-4 text-base font-semibold min-h-[56px] bg-card border border-border text-white"
          >
            Tough Day
          </button>
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
            <BulkCategoryQuestion
              key={code}
              category={CATEGORIES.find((c) => c.code === code)}
              species={pet.species}
              answer={answers[code] || {}}
              onChange={(patch) => setAnswer(code, patch)}
            />
          ))}
        </div>
      )}
    </BottomSheet>
  );
}

// Trimmed copy of DailyCheckInSheet's CategoryQuestion — no dayWord/
// petName-dependent question copy (a bulk apply spans multiple dates, so
// "today"/"yesterday"/a specific date wording doesn't apply to any single
// one of them); everything else (options, multi-select toggle behavior,
// notes) matches exactly so the two flows feel identical to the owner.
function BulkCategoryQuestion({ category, species, answer, onChange }) {
  const Icon = category.icon;

  return (
    <div>
      <div className="flex items-center gap-2 mb-2.5">
        <Icon className="h-4 w-4 text-tier-tertiary flex-shrink-0" />
        <p className="text-sm font-semibold text-white">{category.label}</p>
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
            className="w-32 rounded-xl px-3.5 py-2.5 text-sm font-semibold text-white bg-white/8 border border-white/10 focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <span className="text-xs text-tier-tertiary">lbs (optional)</span>
        </div>
      )}

      {category.answerType === 'text' && (
        <Textarea
          placeholder="Anything noteworthy..."
          value={answer.notes || ''}
          onChange={(e) => onChange({ notes: e.target.value })}
          rows={3}
          className="bg-white/5 border-white/10 text-white placeholder:text-tier-tertiary"
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
