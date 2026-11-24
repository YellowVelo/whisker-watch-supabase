import { useCallback, useEffect, useRef, useState } from 'react';
import { Scale, Pencil, Trash2 } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import BottomSheet from './BottomSheet';
import ListRow from './ListRow';
import ConfirmDeleteDialog from './ConfirmDeleteDialog';
import IconButton from './IconButton';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  listWeights, addWeight, updateWeight, deleteWeight,
  weightErrorText, WEIGHT_MESSAGES, WEIGHT_INPUT_ERROR_CODES,
} from '@/lib/weightClient';
import { dateStrInTimezone } from '@/lib/timezone';
import { reportClientError } from '@/lib/errorMonitoring';

// Log weight sheet (spec 0081 FR2/FR3, wording A–D). Logs a standalone
// weight for a chosen day (default today in the owner's time zone, never
// in the future), and lists the pet's 10 most recent weights with Edit
// and Delete. A weight from a daily check-in is labeled (wording D) and
// keeps its check-in's date; only its value can change. Callers show this
// only for pets the person owns or co-owns (sitters can't write weights).
// `onChanged` runs after every successful save, edit or delete so the
// caller can refresh its own weight display.
export default function WeightLogSheet({ petId, timezone, onClose, onChanged }) {
  const today = dateStrInTimezone(timezone, 0);
  const [entries, setEntries] = useState(/** @type {any[] | null} */ (null));
  const [listError, setListError] = useState(false);
  const [date, setDate] = useState(today);
  const [lbs, setLbs] = useState('');
  const [editing, setEditing] = useState(/** @type {any} */ (null));
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(/** @type {any} */ (null));
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const weightInputRef = useRef(null);

  // BottomSheet's Escape handler is registered once, so it reads whether
  // the delete confirm is open from a ref: Escape there closes only the
  // confirm, never the sheet behind it.
  const confirmOpenRef = useRef(false);
  confirmOpenRef.current = deleteTarget != null;
  const handleSheetClose = useCallback(() => {
    if (confirmOpenRef.current) return;
    onClose();
  }, [onClose]);

  const loadList = useCallback(async () => {
    try {
      const list = await listWeights(petId);
      setEntries(list);
      setListError(false);
    } catch (err) {
      reportClientError(err, { feature: 'weight_log', note: 'list' });
      setListError(true);
    }
  }, [petId]);

  useEffect(() => { loadList(); }, [loadList]);

  const resetForm = () => {
    setEditing(null);
    setDate(dateStrInTimezone(timezone, 0));
    setLbs('');
    setFormError('');
  };

  const startEdit = (entry) => {
    setEditing(entry);
    setDate(entry.date);
    setLbs(String(entry.lbs));
    setFormError('');
    weightInputRef.current?.focus();
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setFormError('');
    try {
      if (editing) {
        await updateWeight(editing, editing.fromCheckIn ? { lbs } : { date, lbs }, timezone);
      } else {
        await addWeight(petId, { date, lbs }, timezone);
      }
      resetForm();
      await loadList();
      onChanged?.();
    } catch (err) {
      const notFound = err?.code === 'weight_not_found' || err?.code === 'PGRST116';
      if (!notFound && !WEIGHT_INPUT_ERROR_CODES.has(err?.code)) {
        reportClientError(err, { feature: 'weight_log', note: editing ? 'edit' : 'add' });
      }
      if (notFound) {
        resetForm();
        loadList();
      }
      setFormError(weightErrorText(err, 'save'));
    } finally {
      setSaving(false);
    }
  };

  const openDelete = (entry) => {
    setDeleteError('');
    setDeleteTarget(entry);
  };

  const closeDelete = (step) => {
    if (step === 0 && !deleting) {
      setDeleteTarget(null);
      setDeleteError('');
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    setDeleteError('');
    try {
      await deleteWeight(deleteTarget);
      if (editing?.id === deleteTarget.id) resetForm();
      setDeleteTarget(null);
      await loadList();
      onChanged?.();
    } catch (err) {
      if (err?.code === 'weight_not_found') {
        loadList();
      } else {
        reportClientError(err, { feature: 'weight_log', note: 'delete' });
      }
      setDeleteError(weightErrorText(err, 'delete'));
    } finally {
      setDeleting(false);
    }
  };

  const dateLocked = !!editing?.fromCheckIn;

  return (
    <>
      <BottomSheet titleId="weight-log-title" title="Log weight" onClose={handleSheetClose}>
        <form onSubmit={handleSave} className="space-y-4 pb-2" noValidate>
          <div className="space-y-1.5">
            <Label htmlFor="weight-log-date" className="text-[13px] text-tier-secondary">Date</Label>
            <Input
              id="weight-log-date"
              type="date"
              value={date}
              max={today}
              disabled={dateLocked || saving}
              onChange={(e) => setDate(e.target.value)}
              className="h-11 rounded-xl bg-card border-border text-white"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="weight-log-lbs" className="text-[13px] text-tier-secondary">Weight</Label>
            <div className="flex items-center gap-3">
              <Input
                id="weight-log-lbs"
                ref={weightInputRef}
                type="number"
                inputMode="decimal"
                step="0.1"
                min="0.1"
                max="300"
                value={lbs}
                disabled={saving}
                onChange={(e) => setLbs(e.target.value)}
                className="h-11 w-32 rounded-xl bg-card border-border text-white font-semibold"
              />
              <span className="text-[13px] text-tier-tertiary">lbs</span>
            </div>
          </div>
          {formError && <p role="alert" className="text-[13px] text-destructive">{formError}</p>}
          <div className="flex gap-2">
            <Button type="submit" disabled={saving} className="flex-1">Save</Button>
            {editing && (
              <Button type="button" variant="outline" onClick={resetForm} disabled={saving} className="flex-1">Cancel</Button>
            )}
          </div>
        </form>

        <section aria-labelledby="weight-log-recent" className="pt-4 pb-4">
          <h4 id="weight-log-recent" className="text-[15px] font-semibold text-white mb-2">Recent weights</h4>
          {listError ? (
            <p className="text-[13px] text-tier-tertiary py-3">{WEIGHT_MESSAGES.load_failed}</p>
          ) : entries === null ? (
            <div className="space-y-2" aria-busy="true">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-16 rounded-2xl animate-pulse" style={{ background: 'rgba(255,255,255,0.05)' }} />
              ))}
            </div>
          ) : entries.length === 0 ? (
            <p className="text-[13px] text-tier-tertiary py-3">No weights logged yet.</p>
          ) : (
            <ul className="rounded-2xl bg-card border border-border divide-y divide-border">
              {entries.map((entry) => (
                <li key={entry.id} data-testid="weight-log-entry">
                  <ListRow
                    standalone={false}
                    icon={Scale}
                    title={`${format(parseISO(entry.date), 'MMM d, yyyy')} · ${entry.lbs.toFixed(1)} lbs`}
                    subtitle={entry.fromCheckIn ? 'From daily check-in' : undefined}
                    value={(
                      <span className="flex items-center gap-1">
                        <IconButton icon={Pencil} variant="plain" aria-label="Edit" iconClassName="h-4 w-4 text-tier-secondary" onClick={() => startEdit(entry)} />
                        <IconButton icon={Trash2} variant="plain" aria-label="Delete" iconClassName="h-4 w-4 text-tier-secondary" onClick={() => openDelete(entry)} />
                      </span>
                    )}
                  />
                </li>
              ))}
            </ul>
          )}
        </section>
      </BottomSheet>

      <ConfirmDeleteDialog
        step={deleteTarget ? 1 : 0}
        onOpenChange={closeDelete}
        title="Delete this weight?"
        warning={<p className="text-base text-muted-foreground">This can't be undone.</p>}
        confirmLabel="Delete"
        confirmingLabel="Deleting…"
        confirming={deleting}
        error={deleteError}
        onConfirm={handleDelete}
      />
    </>
  );
}
