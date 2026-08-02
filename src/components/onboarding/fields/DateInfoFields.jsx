import { Input } from '@/components/ui/input';
import PillToggle from '@/components/PillToggle';

export const PRECISION_OPTIONS = [
  { value: 'EXACT', label: 'Exact date' },
  { value: 'MONTH_YEAR', label: 'Month & year' },
  { value: 'YEAR', label: 'Year only' },
  { value: 'UNKNOWN', label: "I don't know" },
];

export function resolveDate(precision, { exact, monthYear, year }) {
  if (precision === 'EXACT') return exact || null;
  if (precision === 'MONTH_YEAR') return monthYear ? `${monthYear}-01` : null;
  if (precision === 'YEAR') return year ? `${year}-01-01` : null;
  return null;
}

// Inverse of resolveDate — given a stored date + its precision, rebuilds
// the {exact, monthYear, year} parts an editable form needs to pre-fill.
// Used when opening the Edit Pet page for a pet that already has a
// birth/gotcha date saved (onboarding never needs this — it only ever
// starts from a blank draft).
export function decomposeDateParts(date, precision) {
  if (!date || !precision || precision === 'UNKNOWN') return { exact: '', monthYear: '', year: '' };
  if (precision === 'EXACT') return { exact: date, monthYear: '', year: '' };
  if (precision === 'MONTH_YEAR') return { exact: '', monthYear: date.slice(0, 7), year: '' };
  if (precision === 'YEAR') return { exact: '', monthYear: '', year: date.slice(0, 4) };
  return { exact: '', monthYear: '', year: '' };
}

export function isDateInfoValid(precision, parts) {
  if (!precision) return false;
  if (precision === 'UNKNOWN') return true;
  if (precision === 'EXACT') {
    if (!parts.exact) return false;
    return new Date(parts.exact) <= new Date();
  }
  if (precision === 'MONTH_YEAR') {
    if (!parts.monthYear) return false;
    return parts.monthYear <= new Date().toISOString().slice(0, 7);
  }
  if (precision === 'YEAR') {
    if (!parts.year) return false;
    return Number(parts.year) <= new Date().getFullYear();
  }
  return false;
}

// Precision pill-picker (Exact date / Month & year / Year only / I don't
// know) + the matching input for whichever precision is selected. Shared by
// onboarding's PetInfoCard (creating a pet) and the Edit Pet page (editing
// an existing one) so both render identical date-precision UI.
export default function DateInfoFields({ precision, parts, onPrecisionChange, onPartsChange, idPrefix }) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {PRECISION_OPTIONS.map(opt => (
          <PillToggle
            key={opt.value}
            active={precision === opt.value}
            onClick={() => onPrecisionChange(opt.value)}
            className="text-[13px] px-3 py-1.5"
          >
            {opt.label}
          </PillToggle>
        ))}
      </div>
      {precision === 'EXACT' && (
        <Input
          type="date"
          id={`${idPrefix}-exact`}
          aria-label="Exact date"
          value={parts.exact}
          max={new Date().toISOString().slice(0, 10)}
          onChange={e => onPartsChange({ ...parts, exact: e.target.value })}
        />
      )}
      {precision === 'MONTH_YEAR' && (
        <Input
          type="month"
          id={`${idPrefix}-month-year`}
          aria-label="Month and year"
          value={parts.monthYear}
          max={new Date().toISOString().slice(0, 7)}
          onChange={e => onPartsChange({ ...parts, monthYear: e.target.value })}
        />
      )}
      {precision === 'YEAR' && (
        <Input
          type="number"
          id={`${idPrefix}-year`}
          aria-label="Year"
          inputMode="numeric"
          placeholder={`e.g. ${new Date().getFullYear() - 3}`}
          value={parts.year}
          max={new Date().getFullYear()}
          onChange={e => onPartsChange({ ...parts, year: e.target.value })}
        />
      )}
    </div>
  );
}
