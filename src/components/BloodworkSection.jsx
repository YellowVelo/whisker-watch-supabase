import { useState, useEffect, useRef } from 'react';
import {
  uploadFile, checkBloodworkUploadFile, bloodworkUploadPurpose, BLOODWORK_FILE_ACCEPT, BLOODWORK_UPLOAD_HELP,
} from '@/api/storageClient';
import { usePendingScan } from '@/lib/scannedDocuments';
import { entities } from '@/api/entities';
import { invokeAI } from '@/api/aiClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Plus, FlaskConical, ChevronDown, ChevronUp, Pencil, Trash2, Upload, Loader2 } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { format, parseISO } from 'date-fns';
import { useToast } from '@/components/ui/use-toast';
import { BLOODWORK_FIELDS as FIELDS, URINE_PROTEIN_VALUES } from '@/lib/bloodworkFields';
import { readBloodworkSpreadsheet, SPREADSHEET_MESSAGES } from '@/lib/bloodworkSpreadsheet';
import {
  buildReviewVisits, includedVisits, reviewVisitToRecord, bloodworkImportErrorText, shouldReportImportError,
  changeVisitDate, toggleVisitWeight, weightToSave, SCAN_NOTHING_FOUND,
} from '@/lib/bloodworkImport';
import { aiErrorText } from '@/lib/aiGuardrails';
import { reportClientError } from '@/lib/errorMonitoring';
import { listWeights, addWeight } from '@/lib/weightClient';
import { useAuth } from '@/lib/AuthContext';
import { detectTimezone } from '@/lib/timezone';
import BloodworkImportReview from '@/components/BloodworkImportReview';

const URINE_FIELDS = [
  { key: 'urine_specific_gravity', label: 'Urine Specific Gravity' },
  { key: 'urine_protein', label: 'Urine Protein' },
];

const EMPTY_FORM = { date: '', lab_name: '', vet_name: '', notes: '', urine_specific_gravity: '', urine_protein: '' };

export default function BloodworkSection({ petId }) {
  const { toast } = useToast();
  const { user } = useAuth();
  const timezone = user?.timezone || detectTimezone() || 'UTC';
  // Spec 0071/0081: an imported file (photo, PDF or spreadsheet) is kept,
  // linked to this pet, only if the review is confirmed; closing the
  // review, or a failed import, deletes it.
  const pendingScan = usePendingScan('bloodwork');
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  // { visits, unplacedSkipped } from buildReviewVisits, plus the
  // bloodworkDates/weightDates they were checked against, while the import
  // review is open.
  const [review, setReview] = useState(null);
  const [reviewSaving, setReviewSaving] = useState(false);
  // Read by closeReview, so a close during a save is ignored whichever
  // render's handler the sheet calls.
  const reviewSavingRef = useRef(false);
  const [expandedId, setExpandedId] = useState(null);
  const [chartField, setChartField] = useState('creatinine');

  const load = async () => {
    setLoading(true);
    const data = await entities.Bloodwork.filter({ pet_id: petId }, '-date', 100);
    setRecords(data);
    setLoading(false);
  };

  useEffect(() => { load(); }, [petId]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const openAdd = () => {
    setEditing(null);
    setForm({ ...EMPTY_FORM, date: new Date().toISOString().split('T')[0] });
    setDialogOpen(true);
  };

  // Dates that already have a bloodwork record (FR30, "Already on file").
  const loadBloodworkDates = async () => {
    const rows = await entities.Bloodwork.filter({ pet_id: petId }, '-date', 1000);
    return new Set(rows.map((r) => r.date).filter(Boolean));
  };

  // Dates that already have a weight (FR36). null if they can't be loaded,
  // so every weight line starts unticked rather than risk replacing one.
  const loadWeightDates = async () => {
    try {
      const weights = await listWeights(petId, Infinity);
      return new Set(weights.map((w) => w.date).filter(Boolean));
    } catch (err) {
      reportClientError(err, { feature: 'bloodwork_import', note: 'Could not load weights for the import review' });
      return null;
    }
  };

  // Spec 0081 (FR27, FR28, FR32-FR35): photos, PDFs and spreadsheets all
  // open the same review. A spreadsheet is read here first, so an old .xls
  // or an oversized sheet never uploads or reaches the AI; only its text is
  // sent to the AI, never the file.
  const handleImport = async (e) => {
    const input = e.target;
    const file = input.files?.[0];
    if (!file) return;
    const refusal = checkBloodworkUploadFile(file);
    if (refusal) {
      toast({ variant: 'destructive', description: refusal });
      input.value = '';
      return;
    }
    const purpose = bloodworkUploadPurpose(file);
    setImporting(true);
    try {
      const sheetText = purpose === 'spreadsheet' ? (await readBloodworkSpreadsheet(file)).text : null;

      const { path } = await uploadFile({ file, purpose });
      pendingScan.hold(path);

      // The server writes the instructions for both tasks (spec 0080) and
      // answers { visits, skipped } (spec 0081). For a photo or PDF it
      // reads the file from storage itself.
      const result = purpose === 'spreadsheet'
        ? await invokeAI({ task: 'bloodwork_spreadsheet', pet_id: petId, sheet_text: sheetText })
        : await invokeAI({ task: 'scan_bloodwork', pet_id: petId, file_path: path });

      const [bloodworkDates, weightDates] = await Promise.all([loadBloodworkDates(), loadWeightDates()]);
      const built = buildReviewVisits(result, { bloodworkDates, weightDates });
      if (built.visits.length === 0) {
        pendingScan.discard();
        toast({ variant: 'destructive', description: purpose === 'spreadsheet' ? SPREADSHEET_MESSAGES.nothing_found : SCAN_NOTHING_FOUND });
        return;
      }
      setReview({ ...built, bloodworkDates, weightDates });
    } catch (err) {
      pendingScan.discard();
      if (shouldReportImportError(err)) {
        reportClientError(err, { feature: 'bloodwork_import', note: 'Bloodwork import failed', purpose });
      }
      toast({ variant: 'destructive', description: bloodworkImportErrorText(err) });
    } finally {
      setImporting(false);
      input.value = '';
    }
  };

  const updateVisit = (key, change) => {
    setReview((r) => r && { ...r, visits: r.visits.map((v) => (v.key === key ? change(v) : v)) });
  };
  const toggleVisit = (key) => updateVisit(key, (v) => ({ ...v, included: !v.included }));
  const toggleWeight = (key) => updateVisit(key, toggleVisitWeight);
  // A new date works out "Already on file" and the weight tick again (FR30, FR36).
  const editVisit = (key, field, value) => setReview((r) => r && {
    ...r,
    visits: r.visits.map((v) => {
      if (v.key !== key) return v;
      if (field === 'date') return changeVisitDate(v, value, r);
      return { ...v, form: { ...v.form, [field]: value } };
    }),
  });

  const closeReview = () => {
    if (reviewSavingRef.current) return;
    pendingScan.discard();
    setReview(null);
  };

  // FR31/FR36: each ticked visit becomes a bloodwork record, and its ticked
  // weight is logged on that visit's date straight after, so a visit leaves
  // the review only once both are saved. The pet's weights are loaded again
  // first, so a weight already on file is never replaced unless the owner
  // ticked that line for that date (weightToSave). The file is linked to
  // the pet once anything is saved. If a save fails partway, the saved
  // visits leave the review and the rest stay for another try; a visit
  // whose record saved but whose weight failed stays too, and a retry
  // updates its record instead of adding a second one.
  const confirmReview = async () => {
    if (!review || reviewSavingRef.current) return;
    const chosen = includedVisits(review.visits);
    const savedKeys = new Set();
    /** @type {Map<string, string>} */
    const savedIds = new Map();
    const savedBloodworkDates = [];
    const savedWeightDates = [];
    reviewSavingRef.current = true;
    setReviewSaving(true);
    try {
      const freshWeightDates = await loadWeightDates();
      for (const visit of chosen) {
        const record = reviewVisitToRecord(visit, petId);
        if (visit.savedId) {
          await entities.Bloodwork.update(visit.savedId, record);
        } else {
          const row = await entities.Bloodwork.create(record);
          savedIds.set(visit.key, row?.id);
        }
        savedBloodworkDates.push(visit.form.date);
        if (weightToSave(visit, freshWeightDates)) {
          await addWeight(petId, { date: visit.form.date, lbs: visit.weightLbs }, timezone);
          savedWeightDates.push(visit.form.date);
          freshWeightDates?.add(visit.form.date);
        }
        savedKeys.add(visit.key);
      }
    } catch (err) {
      reportClientError(err, { feature: 'bloodwork_import', note: 'Could not save imported bloodwork' });
      // The app's generic failure message (the same one aiErrorText uses).
      toast({ variant: 'destructive', description: aiErrorText(null) });
    }
    const anySaved = savedKeys.size > 0 || savedIds.size > 0;
    if (anySaved) await pendingScan.keep([petId]);
    const allSaved = chosen.every((v) => savedKeys.has(v.key));
    setReview((r) => {
      if (!r || allSaved) return null;
      const weightDates = r.weightDates && new Set([...r.weightDates, ...savedWeightDates]);
      return {
        ...r,
        bloodworkDates: new Set([...r.bloodworkDates, ...savedBloodworkDates]),
        weightDates,
        visits: r.visits
          .filter((v) => !savedKeys.has(v.key))
          .map((v) => (savedIds.has(v.key) ? { ...v, savedId: savedIds.get(v.key) } : v)),
      };
    });
    reviewSavingRef.current = false;
    setReviewSaving(false);
    if (anySaved) load();
  };

  const openEdit = (r) => {
    setEditing(r);
    const f = { ...EMPTY_FORM };
    Object.keys(f).forEach(k => { f[k] = r[k] ?? ''; });
    FIELDS.forEach(({ key }) => { f[key] = r[key] ?? ''; });
    setForm(f);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    setSaving(true);
    const data = { pet_id: petId };
    Object.entries(form).forEach(([k, v]) => {
      if (v === '' || v === null || v === undefined) return;
      const numField = FIELDS.find(f => f.key === k);
      data[k] = numField ? parseFloat(v) : v;
    });
    if (editing) {
      await entities.Bloodwork.update(editing.id, data);
    } else {
      await entities.Bloodwork.create(data);
    }
    setSaving(false);
    setDialogOpen(false);
    load();
  };

  const handleDelete = async (id) => {
    await entities.Bloodwork.delete(id);
    load();
  };

  const chartData = [...records]
    .filter(r => r[chartField] != null)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(r => ({ date: format(parseISO(r.date), 'MM/dd'), value: r[chartField] }));

  const currentField = FIELDS.find(f => f.key === chartField);

  if (loading) return <div className="py-10 text-center text-muted-foreground text-sm">Loading...</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-sm text-muted-foreground">{records.length} record{records.length !== 1 ? 's' : ''}</p>
        <div className="flex gap-2 flex-wrap">
          {importing && (
            <span className="flex items-center gap-1.5 text-sm text-muted-foreground px-2">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Scanning...
            </span>
          )}

          <label className="cursor-pointer">
            <Button size="sm" variant="outline" asChild disabled={importing}>
              <span>
                <Upload className="h-4 w-4 mr-1" />
                Upload File
              </span>
            </Button>
            <input type="file" accept={BLOODWORK_FILE_ACCEPT} className="hidden" onChange={handleImport} disabled={importing} />
          </label>
          <Button size="sm" onClick={openAdd}><Plus className="h-4 w-4 mr-1" /> Add</Button>
        </div>
      </div>
      <p className="text-[13px] text-muted-foreground text-right -mt-2">{BLOODWORK_UPLOAD_HELP}</p>

      {records.length >= 2 && (
        <div className="bg-card border border-border rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">Trend</p>
            <select
              value={chartField}
              onChange={e => setChartField(e.target.value)}
              className="text-sm border border-border rounded-md px-2 py-1 bg-background"
            >
              {FIELDS.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
            </select>
          </div>
          <ResponsiveContainer width="100%" height={160}>
            <LineChart data={chartData}>
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} width={40} />
              <Tooltip formatter={(v) => [`${v} ${currentField?.unit}`, currentField?.label]} />
              <Line type="monotone" dataKey="value" stroke={currentField?.color} strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
          {currentField && <p className="text-sm text-muted-foreground text-center">Reference range: {currentField.normal} {currentField.unit}</p>}
        </div>
      )}

      {records.length === 0 ? (
        <div className="text-center py-12">
          <FlaskConical className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">No bloodwork records yet.</p>
          <p className="text-sm text-muted-foreground/70 mt-1">Add results to track trends over time.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {records.map(r => (
            <div key={r.id} className="bg-card border border-border rounded-xl overflow-hidden">
              <div
                className="flex items-center justify-between px-4 py-3 cursor-pointer"
                onClick={() => setExpandedId(expandedId === r.id ? null : r.id)}
              >
                <div>
                  <p className="font-medium text-sm">{format(parseISO(r.date), 'MMMM d, yyyy')}</p>
                  {(r.lab_name || r.vet_name) && (
                    <p className="text-sm text-muted-foreground">{[r.lab_name, r.vet_name].filter(Boolean).join(' · ')}</p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={e => { e.stopPropagation(); openEdit(r); }} className="text-muted-foreground hover:text-foreground">
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button onClick={e => { e.stopPropagation(); handleDelete(r.id); }} className="text-muted-foreground hover:text-destructive">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                  {expandedId === r.id ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                </div>
              </div>
              {expandedId === r.id && (
                <div className="border-t border-border px-4 py-3 grid grid-cols-2 gap-x-6 gap-y-1.5">
                  {FIELDS.filter(f => r[f.key] != null).map(f => (
                    <div key={f.key} className="flex justify-between items-center text-sm">
                      <span className="text-muted-foreground text-sm">{f.label}</span>
                      <span className="font-medium text-sm">{r[f.key]} <span className="text-muted-foreground font-normal">{f.unit}</span></span>
                    </div>
                  ))}
                  {URINE_FIELDS.filter(f => r[f.key]).map(f => (
                    <div key={f.key} className="flex justify-between items-center text-sm">
                      <span className="text-muted-foreground text-sm">{f.label}</span>
                      <span className="font-medium text-sm">{r[f.key]}</span>
                    </div>
                  ))}
                  {r.notes && <div className="col-span-2 text-sm text-muted-foreground mt-1 pt-1 border-t border-border">{r.notes}</div>}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {review && (
        <BloodworkImportReview
          visits={review.visits}
          unplacedSkipped={review.unplacedSkipped}
          saving={reviewSaving}
          timezone={timezone}
          onToggle={toggleVisit}
          onToggleWeight={toggleWeight}
          onEdit={editVisit}
          onConfirm={confirmReview}
          onClose={closeReview}
        />
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-2xl">{editing ? 'Edit' : 'Add'} Bloodwork</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5 col-span-2">
                <Label>Date *</Label>
                <Input type="date" value={form.date} onChange={e => set('date', e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Lab Name</Label>
                <Input value={form.lab_name} onChange={e => set('lab_name', e.target.value)} placeholder="e.g. Antech" />
              </div>
              <div className="space-y-1.5">
                <Label>Ordering Vet</Label>
                <Input value={form.vet_name} onChange={e => set('vet_name', e.target.value)} placeholder="Dr. Smith" />
              </div>
            </div>

            <p className="text-[13px] font-semibold text-muted-foreground uppercase tracking-wider pt-1">Blood Values — leave blank if not reported</p>
            <div className="grid grid-cols-2 gap-3">
              {FIELDS.map(f => (
                <div key={f.key} className="space-y-1">
                  <Label className="text-sm">{f.label} <span className="text-muted-foreground font-normal">({f.unit})</span></Label>
                  <Input
                    type="number"
                    step="any"
                    placeholder={`Normal: ${f.normal}`}
                    value={form[f.key] ?? ''}
                    onChange={e => set(f.key, e.target.value)}
                  />
                </div>
              ))}
            </div>

            <p className="text-[13px] font-semibold text-muted-foreground uppercase tracking-wider pt-1">Urinalysis</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-sm">Urine Specific Gravity</Label>
                <Input value={form.urine_specific_gravity} onChange={e => set('urine_specific_gravity', e.target.value)} placeholder="e.g. 1.020" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">Urine Protein</Label>
                <select
                  value={form.urine_protein}
                  onChange={e => set('urine_protein', e.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
                >
                  <option value="">Not reported</option>
                  {URINE_PROTEIN_VALUES.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Textarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={2} placeholder="Vet comments, context..." />
            </div>

            <Button onClick={handleSave} className="w-full" disabled={saving || !form.date}>
              {saving ? 'Saving...' : editing ? 'Save Changes' : 'Add Record'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}