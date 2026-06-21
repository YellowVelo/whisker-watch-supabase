import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client'; // still used below for UploadFile (Phase B)
import { entities } from '@/api/entities';
import { invokeAI } from '@/api/aiClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Plus, FlaskConical, ChevronDown, ChevronUp, Pencil, Trash2, Upload, Loader2, Camera } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { format, parseISO } from 'date-fns';

const FIELDS = [
  { key: 'bun', label: 'BUN', unit: 'mg/dL', normal: '14–36', color: '#3b82f6' },
  { key: 'creatinine', label: 'Creatinine', unit: 'mg/dL', normal: '0.6–2.4', color: '#ef4444' },
  { key: 'sdma', label: 'SDMA', unit: 'µg/dL', normal: '<14', color: '#8b5cf6' },
  { key: 'phosphorus', label: 'Phosphorus', unit: 'mg/dL', normal: '2.4–8.2', color: '#f59e0b' },
  { key: 'potassium', label: 'Potassium', unit: 'mEq/L', normal: '3.5–5.8', color: '#10b981' },
  { key: 'sodium', label: 'Sodium', unit: 'mEq/L', normal: '149–164', color: '#06b6d4' },
  { key: 'calcium', label: 'Calcium', unit: 'mg/dL', normal: '8.8–11.9', color: '#f97316' },
  { key: 'hematocrit', label: 'Hematocrit', unit: '%', normal: '24–45', color: '#ec4899' },
  { key: 'hemoglobin', label: 'Hemoglobin', unit: 'g/dL', normal: '8–15', color: '#84cc16' },
  { key: 'total_protein', label: 'Total Protein', unit: 'g/dL', normal: '5.4–8.2', color: '#6366f1' },
  { key: 'albumin', label: 'Albumin', unit: 'g/dL', normal: '2.2–4.0', color: '#14b8a6' },
  { key: 'alt', label: 'ALT', unit: 'U/L', normal: '10–100', color: '#f43f5e' },
  { key: 'ast', label: 'AST', unit: 'U/L', normal: '0–48', color: '#a855f7' },
  { key: 'alkaline_phosphatase', label: 'Alk Phos', unit: 'U/L', normal: '14–111', color: '#fb923c' },
  { key: 'glucose', label: 'Glucose', unit: 'mg/dL', normal: '70–150', color: '#22c55e' },
  { key: 't4', label: 'T4 Thyroid', unit: 'µg/dL', normal: '0.8–4.7', color: '#0ea5e9' },
];

const URINE_FIELDS = [
  { key: 'urine_specific_gravity', label: 'Urine Specific Gravity' },
  { key: 'urine_protein', label: 'Urine Protein' },
];

const EMPTY_FORM = { date: '', lab_name: '', vet_name: '', notes: '', urine_specific_gravity: '', urine_protein: '' };

export default function BloodworkSection({ petId }) {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
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

  const handleImport = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });

      // The Edge Function detects whether file_url points to an image
      // or a PDF (via content-type) and builds the right Claude input
      // block either way, so the same call works for both — no need
      // for a separate code path like Base44's ExtractDataFromUploadedFile.
      const fieldList = FIELDS.map(f => `${f.key} (${f.label}, ${f.unit})`).join(', ');
      const result = await invokeAI({
        prompt: `You are analyzing a veterinary bloodwork report (image or PDF). Extract all available values from this lab report. Return only a JSON object with these possible fields: date (YYYY-MM-DD), lab_name, vet_name, urine_specific_gravity, urine_protein (one of: Negative, Trace, 1+, 2+, 3+, 4+), notes, and numeric fields: ${fieldList}. Only include fields that are clearly visible in the document. Omit fields not present.`,
        file_urls: [file_url],
        response_json_schema: {
          type: 'object',
          properties: Object.fromEntries([
            ...FIELDS.map(f => [f.key, { type: 'number' }]),
            ['date', { type: 'string' }],
            ['lab_name', { type: 'string' }],
            ['vet_name', { type: 'string' }],
            ['urine_specific_gravity', { type: 'string' }],
            ['urine_protein', { type: 'string' }],
            ['notes', { type: 'string' }],
          ])
        }
      });
      const extracted = result;

      if (extracted) {
        const f = { ...EMPTY_FORM };
        Object.keys(extracted).forEach(k => { if (extracted[k] != null && extracted[k] !== '') f[k] = extracted[k]; });
        setEditing(null);
        setForm(f);
        setDialogOpen(true);
      }
    } finally {
      setImporting(false);
      e.target.value = '';
    }
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
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground px-2">
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
            <input type="file" accept="image/*,.pdf,.csv" className="hidden" onChange={handleImport} disabled={importing} />
          </label>
          <Button size="sm" onClick={openAdd}><Plus className="h-4 w-4 mr-1" /> Add</Button>
        </div>
      </div>

      {records.length >= 2 && (
        <div className="bg-card border border-border rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">Trend</p>
            <select
              value={chartField}
              onChange={e => setChartField(e.target.value)}
              className="text-xs border border-border rounded-md px-2 py-1 bg-background"
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
          {currentField && <p className="text-xs text-muted-foreground text-center">Reference range: {currentField.normal} {currentField.unit}</p>}
        </div>
      )}

      {records.length === 0 ? (
        <div className="text-center py-12">
          <FlaskConical className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">No bloodwork records yet.</p>
          <p className="text-xs text-muted-foreground/70 mt-1">Add results to track trends over time.</p>
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
                    <p className="text-xs text-muted-foreground">{[r.lab_name, r.vet_name].filter(Boolean).join(' · ')}</p>
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
                      <span className="text-muted-foreground text-xs">{f.label}</span>
                      <span className="font-medium text-xs">{r[f.key]} <span className="text-muted-foreground font-normal">{f.unit}</span></span>
                    </div>
                  ))}
                  {URINE_FIELDS.filter(f => r[f.key]).map(f => (
                    <div key={f.key} className="flex justify-between items-center text-sm">
                      <span className="text-muted-foreground text-xs">{f.label}</span>
                      <span className="font-medium text-xs">{r[f.key]}</span>
                    </div>
                  ))}
                  {r.notes && <div className="col-span-2 text-xs text-muted-foreground mt-1 pt-1 border-t border-border">{r.notes}</div>}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-serif text-xl">{editing ? 'Edit' : 'Add'} Bloodwork</DialogTitle>
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

            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider pt-1">Blood Values — leave blank if not reported</p>
            <div className="grid grid-cols-2 gap-3">
              {FIELDS.map(f => (
                <div key={f.key} className="space-y-1">
                  <Label className="text-xs">{f.label} <span className="text-muted-foreground font-normal">({f.unit})</span></Label>
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

            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider pt-1">Urinalysis</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Urine Specific Gravity</Label>
                <Input value={form.urine_specific_gravity} onChange={e => set('urine_specific_gravity', e.target.value)} placeholder="e.g. 1.020" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Urine Protein</Label>
                <select
                  value={form.urine_protein}
                  onChange={e => set('urine_protein', e.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
                >
                  <option value="">Not reported</option>
                  {['Negative', 'Trace', '1+', '2+', '3+', '4+'].map(o => <option key={o} value={o}>{o}</option>)}
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