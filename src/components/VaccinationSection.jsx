import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client'; // still used below for UploadFile (Phase B)
import { entities } from '@/api/entities';
import { invokeAI } from '@/api/aiClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Plus, Syringe, Pencil, Trash2, Bell, Upload, Loader2 } from 'lucide-react';
import { format, parseISO, differenceInDays, isPast } from 'date-fns';
import { getVaccines } from '@/lib/speciesConfig';

const EMPTY_FORM = { vaccine_name: '', date_given: '', next_due_date: '', administered_by: '', lot_number: '', notes: '' };

function getReminderStatus(next_due_date) {
  if (!next_due_date) return null;
  const days = differenceInDays(parseISO(next_due_date), new Date());
  if (days < 0) return { label: `Overdue by ${Math.abs(days)}d`, color: 'bg-red-100 text-red-700 border-red-200' };
  if (days <= 30) return { label: `Due in ${days}d`, color: 'bg-amber-100 text-amber-700 border-amber-200' };
  return { label: `Due ${format(parseISO(next_due_date), 'MMM d, yyyy')}`, color: 'bg-green-100 text-green-700 border-green-200' };
}

export default function VaccinationSection({ petId, species }) {
  const [vaccines, setVaccines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [scanning, setScanning] = useState(false);

  const load = async () => {
    setLoading(true);
    const data = await entities.Vaccination.filter({ pet_id: petId }, '-date_given');
    setVaccines(data);
    setLoading(false);
  };

  useEffect(() => { load(); }, [petId]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const openAdd = () => { setEditing(null); setForm(EMPTY_FORM); setDialogOpen(true); };
  const openEdit = (v) => {
    setEditing(v);
    setForm({ vaccine_name: v.vaccine_name || '', date_given: v.date_given || '', next_due_date: v.next_due_date || '', administered_by: v.administered_by || '', lot_number: v.lot_number || '', notes: v.notes || '' });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    setSaving(true);
    const data = { pet_id: petId, ...form };
    if (!data.date_given) delete data.date_given;
    if (!data.next_due_date) delete data.next_due_date;
    if (editing) await entities.Vaccination.update(editing.id, data);
    else await entities.Vaccination.create(data);
    setSaving(false);
    setDialogOpen(false);
    load();
  };

  const handleDelete = async (id) => {
    await entities.Vaccination.delete(id);
    load();
  };

  const handleScan = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setScanning(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      const result = await invokeAI({
        prompt: `You are analyzing a veterinary vaccine record document. Extract ALL vaccinations visible on this document. For each vaccine return: vaccine_name, date_given (YYYY-MM-DD), next_due_date (YYYY-MM-DD), administered_by (vet/clinic name), lot_number, notes. Only include fields clearly visible.`,
        file_urls: [file_url],
        response_json_schema: {
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
                }
              }
            }
          }
        }
      });

      const scanned = result?.vaccines || [];
      if (scanned.length === 0) return;

      // Match scanned records against existing by vaccine_name (case-insensitive)
      await Promise.all(scanned.map(async (scannedVax) => {
        if (!scannedVax.vaccine_name) return;
        const clean = {};
        Object.keys(scannedVax).forEach(k => { if (scannedVax[k] != null && scannedVax[k] !== '') clean[k] = scannedVax[k]; });

        const existing = vaccines.find(v =>
          v.vaccine_name?.toLowerCase().trim() === scannedVax.vaccine_name?.toLowerCase().trim()
        );

        if (existing) {
          await entities.Vaccination.update(existing.id, clean);
        } else {
          await entities.Vaccination.create({ pet_id: petId, ...clean });
        }
      }));

      load();
    } finally {
      setScanning(false);
      e.target.value = '';
    }
  };

  const suggested = getVaccines(species);

  // Sort: overdue first, then upcoming, then no due date
  const sorted = [...vaccines].sort((a, b) => {
    const da = a.next_due_date ? differenceInDays(parseISO(a.next_due_date), new Date()) : 9999;
    const db = b.next_due_date ? differenceInDays(parseISO(b.next_due_date), new Date()) : 9999;
    return da - db;
  });

  if (loading) return <div className="py-10 text-center text-sm text-muted-foreground">Loading...</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{vaccines.length} vaccine record{vaccines.length !== 1 ? 's' : ''}</p>
        <div className="flex gap-2">
          <label className="cursor-pointer">
            <Button size="sm" variant="outline" asChild disabled={scanning}>
              <span>
                {scanning ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Upload className="h-4 w-4 mr-1" />}
                {scanning ? 'Scanning...' : 'Scan Record'}
              </span>
            </Button>
            <input type="file" accept="image/*,.pdf" className="hidden" onChange={handleScan} disabled={scanning} />
          </label>
          <Button size="sm" onClick={openAdd}><Plus className="h-4 w-4 mr-1" /> Add</Button>
        </div>
      </div>

      {sorted.length === 0 ? (
        <div className="text-center py-12">
          <Syringe className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">No vaccination records yet.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {sorted.map(v => {
            const status = getReminderStatus(v.next_due_date);
            return (
              <div key={v.id} className="bg-background border border-border rounded-xl px-4 py-3 flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-medium text-sm">{v.vaccine_name}</p>
                    {status && (
                      <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border ${status.color}`}>
                        <Bell className="h-2.5 w-2.5" /> {status.label}
                      </span>
                    )}
                  </div>
                  {v.date_given && <p className="text-xs text-muted-foreground mt-0.5">Given: {format(parseISO(v.date_given), 'MMM d, yyyy')}</p>}
                  {v.administered_by && <p className="text-xs text-muted-foreground">By: {v.administered_by}</p>}
                  {v.notes && <p className="text-xs text-muted-foreground italic mt-0.5">{v.notes}</p>}
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button onClick={() => openEdit(v)} className="text-muted-foreground hover:text-foreground p-1">
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button onClick={() => handleDelete(v.id)} className="text-muted-foreground hover:text-destructive p-1">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-serif text-xl">{editing ? 'Edit' : 'Add'} Vaccination</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="space-y-1.5">
              <Label>Vaccine Name *</Label>
              <Input value={form.vaccine_name} onChange={e => set('vaccine_name', e.target.value)} placeholder="e.g. Rabies" list="vaccine-suggestions" />
              <datalist id="vaccine-suggestions">
                {suggested.map(s => <option key={s} value={s} />)}
              </datalist>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {suggested.map(s => (
                  <button key={s} type="button" onClick={() => set('vaccine_name', s)}
                    className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${form.vaccine_name === s ? 'bg-primary text-primary-foreground border-primary' : 'bg-background text-muted-foreground border-border hover:border-primary/50'}`}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Date Given</Label>
                <Input type="date" value={form.date_given} onChange={e => set('date_given', e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Next Due Date</Label>
                <Input type="date" value={form.next_due_date} onChange={e => set('next_due_date', e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Administered By</Label>
                <Input value={form.administered_by} onChange={e => set('administered_by', e.target.value)} placeholder="Vet name" />
              </div>
              <div className="space-y-1.5">
                <Label>Lot Number</Label>
                <Input value={form.lot_number} onChange={e => set('lot_number', e.target.value)} placeholder="Optional" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Textarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={2} placeholder="Any reactions, observations..." />
            </div>
            <Button onClick={handleSave} className="w-full" disabled={saving || !form.vaccine_name.trim()}>
              {saving ? 'Saving...' : editing ? 'Save Changes' : 'Add Vaccination'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}