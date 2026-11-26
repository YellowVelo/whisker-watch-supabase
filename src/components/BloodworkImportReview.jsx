import { Loader2 } from 'lucide-react';
import BottomSheet from '@/components/BottomSheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { PALETTE, PALETTE_SOFT } from '@/lib/toneColors';
import { BLOODWORK_FIELDS, URINE_PROTEIN_VALUES } from '@/lib/bloodworkFields';
import {
  includedVisits, canSaveReview, skippedText, skippedGroups, weightLineEnabled, isFutureDate,
  headingDate, weightLineText, reviewCheckboxNames,
} from '@/lib/bloodworkImport';
import { WEIGHT_MESSAGES } from '@/lib/weightClient';

// Review step for bloodwork imported from a photo, PDF or spreadsheet
// (spec 0081, FR30/FR35/FR36, wording F, I, J, K). Laid out like the
// vaccine scan's ScanReviewSheet.jsx: one card per visit, every field
// editable, an Include tick per visit. Nothing is saved until the owner
// confirms; the cards come from buildReviewVisits() in
// src/lib/bloodworkImport.js.

const FIELD_BY_KEY = new Map(BLOODWORK_FIELDS.map((f) => [f.key, f]));

function visitHeading(form) {
  const parts = [];
  if (/^\d{4}-\d{2}-\d{2}$/.test(form.date)) parts.push(headingDate(form.date));
  if (form.lab_name) parts.push(form.lab_name);
  if (form.vet_name) parts.push(form.vet_name);
  return parts.join(' · ');
}

function Badge({ tone, children }) {
  return (
    <span className="text-[13px] px-2 py-0.5 rounded-full shrink-0" style={{ background: PALETTE_SOFT[tone], color: PALETTE[tone] }}>
      {children}
    </span>
  );
}

function Field({ label, children }) {
  return (
    <label className="block space-y-1">
      <span className="block text-[13px] text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

// "Not imported (different unit): …" and "Not imported (no unit): …" lines.
function SkippedLines({ items }) {
  const { differentUnit, noUnit } = skippedGroups(items);
  return (
    <>
      {differentUnit.length > 0 && (
        <p className="text-[13px] text-muted-foreground">Not imported (different unit): {skippedText(differentUnit)}</p>
      )}
      {noUnit.length > 0 && (
        <p className="text-[13px] text-muted-foreground">Not imported (no unit): {skippedText(noUnit)}</p>
      )}
    </>
  );
}

function VisitCard({ visit, names, timezone, onToggle, onToggleWeight, onEdit }) {
  const { form } = visit;
  const edit = (field) => (e) => onEdit(visit.key, field, e.target.value);
  const heading = visitHeading(form);
  const weightEnabled = weightLineEnabled(visit);

  return (
    <div className="border border-border rounded-xl p-3 bg-card space-y-3" data-testid="bloodwork-visit-card">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-1">
          {heading && <p className="text-sm font-semibold text-white">{heading}</p>}
          <div className="flex items-center gap-2 flex-wrap">
            {visit.onFile && <Badge tone="amber">Already on file</Badge>}
          </div>
        </div>
        <label className="flex items-center gap-2 min-h-11 min-w-11 cursor-pointer shrink-0 text-sm text-white">
          <Checkbox checked={visit.included} onCheckedChange={() => onToggle(visit.key)} aria-label={names.include} />
          Include
        </label>
      </div>

      {visit.conflict && (
        <p className="text-[13px]" style={{ color: PALETTE.amber }}>Found twice with different values. Check which is right.</p>
      )}

      <div className="grid grid-cols-2 gap-2">
        <div className="col-span-2">
          <Field label="Date *">
            <Input type="date" value={form.date} onChange={edit('date')} className="h-11 text-sm" />
          </Field>
          {isFutureDate(form.date, timezone) && (
            <p className="text-[13px] text-destructive mt-1">{WEIGHT_MESSAGES.weight_date_in_future}</p>
          )}
        </div>
        <Field label="Lab Name">
          <Input value={form.lab_name} onChange={edit('lab_name')} className="h-11 text-sm" />
        </Field>
        <Field label="Ordering Vet">
          <Input value={form.vet_name} onChange={edit('vet_name')} className="h-11 text-sm" />
        </Field>
      </div>

      {visit.valueKeys.length > 0 && (
        <div className="grid grid-cols-2 gap-2">
          {visit.valueKeys.map((key) => {
            const field = FIELD_BY_KEY.get(key);
            return (
              <Field key={key} label={field.label}>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    step="any"
                    inputMode="decimal"
                    value={form[key]}
                    onChange={edit(key)}
                    className="h-11 text-sm flex-1 min-w-0"
                  />
                  <span className="text-[13px] text-muted-foreground shrink-0" data-testid={`unit-${key}`}>{field.unit}</span>
                </div>
              </Field>
            );
          })}
        </div>
      )}

      {(form.urine_specific_gravity || form.urine_protein) && (
        <div className="grid grid-cols-2 gap-2">
          <Field label="Urine Specific Gravity">
            <Input value={form.urine_specific_gravity} onChange={edit('urine_specific_gravity')} className="h-11 text-sm" />
          </Field>
          <Field label="Urine Protein">
            <select
              value={form.urine_protein}
              onChange={edit('urine_protein')}
              className="flex h-11 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
            >
              <option value="">Not reported</option>
              {URINE_PROTEIN_VALUES.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </Field>
        </div>
      )}

      <Field label="Notes">
        <Textarea value={form.notes} onChange={edit('notes')} rows={2} className="text-sm" />
      </Field>

      <SkippedLines items={visit.skipped} />
      {visit.notTracked.length > 0 && (
        <p className="text-[13px] text-muted-foreground">Not tracked yet: {visit.notTracked.join(', ')}</p>
      )}
      {visit.weightLbs !== null && (
        <label className={`flex items-center gap-3 min-h-11 cursor-pointer text-sm text-white ${weightEnabled ? '' : 'opacity-50'}`}>
          <Checkbox
            checked={visit.includeWeight}
            onCheckedChange={() => onToggleWeight(visit.key)}
            disabled={!weightEnabled}
            aria-label={names.weight}
          />
          {weightLineText(visit)}
        </label>
      )}
    </div>
  );
}

export default function BloodworkImportReview({ visits, unplacedSkipped, saving, timezone, onToggle, onToggleWeight, onEdit, onConfirm, onClose }) {
  const count = includedVisits(visits).length;
  const names = reviewCheckboxNames(visits);

  const subtitle = (
    <p className="text-[13px] text-muted-foreground mt-2">
      We found {visits.length} {visits.length === 1 ? 'visit' : 'visits'}. Check each one before saving.
    </p>
  );

  const footer = (
    <div className="flex gap-2">
      <Button variant="outline" onClick={onClose} className="flex-1 min-h-11" disabled={saving}>Cancel</Button>
      <Button onClick={onConfirm} className="flex-1 min-h-11" disabled={saving || !canSaveReview(visits, timezone)}>
        {saving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Saving...</> : `Save ${count} ${count === 1 ? 'visit' : 'visits'}`}
      </Button>
    </div>
  );

  return (
    <BottomSheet titleId="bloodwork-import-review-title" title="Review imported bloodwork" subtitle={subtitle} onClose={onClose} footer={footer}>
      <div className="space-y-3 pb-2">
        <SkippedLines items={unplacedSkipped} />
        {visits.map((visit) => (
          <VisitCard key={visit.key} visit={visit} names={names.get(visit.key)} timezone={timezone} onToggle={onToggle} onToggleWeight={onToggleWeight} onEdit={onEdit} />
        ))}
      </div>
    </BottomSheet>
  );
}
