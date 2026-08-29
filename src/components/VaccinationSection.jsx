import { useState, useEffect } from 'react';
import { uploadFile } from '@/api/storageClient';
import { entities } from '@/api/entities';
import { invokeAI } from '@/api/aiClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Plus, Syringe, Pencil, Trash2, Bell, Upload, Loader2 } from 'lucide-react';
import { format, parseISO, differenceInDays } from 'date-fns';
import { getVaccines } from '@/lib/speciesConfig';
import { PALETTE } from '@/lib/toneColors';
import { useToast } from '@/components/ui/use-toast';
import { aiErrorText } from '@/lib/aiGuardrails';
import ScanReviewSheet from '@/components/ScanReviewSheet';

const EMPTY_FORM = { vaccine_name: '', date_given: '', next_due_date: '', administered_by: '', lot_number: '', notes: '' };

// Design System Amendment #5/#6 (2026-07-30) — sourced from the semantic
// tone tokens (via inline style) instead of raw light-mode Tailwind
// classes, so this reads correctly regardless of device theme. Overdue/
// due-soon/up-to-date maps cleanly onto bad/warn/good.
function getReminderStatus(next_due_date) {
  if (!next_due_date) return null;
  const days = differenceInDays(parseISO(next_due_date), new Date());
  if (days < 0) return { label: `Overdue by ${Math.abs(days)}d`, background: 'rgba(229,115,115,0.15)', color: PALETTE.red };
  if (days <= 30) return { label: `Due in ${days}d`, background: 'rgba(244,199,107,0.15)', color: PALETTE.amber };
  return { label: `Due ${format(parseISO(next_due_date), 'MMM d, yyyy')}`, background: 'rgba(76,199,176,0.15)', color: PALETTE.teal };
}

export default function VaccinationSection({ petId, species, initialEditId }) {
  const { toast } = useToast();
  const [vaccines, setVaccines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [autoOpenedId, setAutoOpenedId] = useState(null);
  const [reviewGroups, setReviewGroups] = useState([]);
  const [reviewSaving, setReviewSaving] = useState(false);

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

  // Deep link from a vaccination-due notification (spec 0034): open that
  // record's edit form once vaccines have loaded, but only once per id so
  // the dialog doesn't reopen if the owner closes it.
  useEffect(() => {
    if (!initialEditId || loading || autoOpenedId === initialEditId) return;
    const match = vaccines.find(v => v.id === initialEditId);
    if (match) {
      openEdit(match);
      setAutoOpenedId(initialEditId);
    }
  }, [initialEditId, loading, vaccines, autoOpenedId]);

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

  // Spec 0061: a scan no longer saves immediately. It builds a per-pet
  // review list (reviewGroups) and opens ScanReviewSheet — the owner edits/
  // excludes items there and saving only happens once they confirm.
  const handleScan = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setScanning(true);
    try {
      const { file_url } = await uploadFile({ file });
      const allPets = await entities.Pet.list();
      const multiPet = allPets.length > 1;
      const petNameInstruction = multiPet
        ? ` This account has these pets: ${allPets.map(p => p.name).filter(Boolean).join(', ')}. For each vaccination, also include a "pet_name" field naming which of these pets it belongs to, if the document makes that clear (e.g. it's grouped under a pet's name, or this is a multi-pet invoice). If you can't tell which pet a line belongs to, omit "pet_name" rather than guessing.`
        : '';

      const result = await invokeAI({
        prompt: `You are analyzing a veterinary document (e.g. an invoice or vaccine record) that may cover one or more pets. Extract ONLY vaccination line items — ignore medications, exam fees, boarding, grooming, supplies, and any other charge or record type, even if they appear on the same document. For each vaccination return: vaccine_name, date_given (YYYY-MM-DD), next_due_date (YYYY-MM-DD), administered_by (vet/clinic name), lot_number, notes. Only include fields clearly visible.${petNameInstruction}`,
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
                  pet_name: { type: 'string' },
                }
              }
            }
          }
        }
      });

      const scanned = (result?.vaccines || []).filter(v => v.vaccine_name);
      if (scanned.length === 0) {
        toast({ description: 'No vaccinations found on that document.' });
        return;
      }

      // Resolve each line to a pet on this account, by matching pet_name
      // (case-insensitive). Anything unmatched (no pet_name, or a name that
      // isn't one of this account's pets) defaults to the pet whose page
      // the scan was started from — never guessed onto a different pet.
      const resolved = scanned.map((v) => {
        const match = v.pet_name
          ? allPets.find(p => p.name?.toLowerCase().trim() === v.pet_name.toLowerCase().trim())
          : null;
        return { ...v, resolvedPetId: match?.id || petId };
      });

      // Fetch existing vaccinations for any other pet referenced (the
      // current pet's are already loaded in `vaccines`) so the review
      // screen can show "will update" vs "new" per item.
      const otherPetIds = [...new Set(resolved.map(v => v.resolvedPetId).filter(id => id !== petId))];
      const otherVaccinesByPet = {};
      await Promise.all(otherPetIds.map(async (id) => {
        otherVaccinesByPet[id] = await entities.Vaccination.filter({ pet_id: id });
      }));

      const groupsById = new Map();
      resolved.forEach((v, idx) => {
        const existingList = v.resolvedPetId === petId ? vaccines : (otherVaccinesByPet[v.resolvedPetId] || []);
        const existing = existingList.find(ev =>
          ev.vaccine_name?.toLowerCase().trim() === v.vaccine_name.toLowerCase().trim()
        );
        if (!groupsById.has(v.resolvedPetId)) {
          const petMeta = allPets.find(p => p.id === v.resolvedPetId);
          groupsById.set(v.resolvedPetId, { petId: v.resolvedPetId, petName: petMeta?.name || 'Unknown pet', items: [] });
        }
        groupsById.get(v.resolvedPetId).items.push({
          key: `${v.resolvedPetId}-${idx}`,
          included: true,
          matchedExistingId: existing?.id || null,
          vaccine_name: v.vaccine_name || '',
          date_given: v.date_given || '',
          next_due_date: v.next_due_date || '',
          administered_by: v.administered_by || '',
          lot_number: v.lot_number || '',
          notes: v.notes || '',
        });
      });

      setReviewGroups(Array.from(groupsById.values()));
    } catch (err) {
      // Covers both the new rate limit (spec 0050) and any other scan
      // failure — without this, the button just returned to normal with
      // no explanation of why nothing got added.
      toast({ variant: 'destructive', description: aiErrorText(err) });
    } finally {
      setScanning(false);
      e.target.value = '';
    }
  };

  const toggleReviewItem = (targetPetId, key) => {
    setReviewGroups(groups => groups.map(g => g.petId !== targetPetId ? g : {
      ...g,
      items: g.items.map(it => it.key !== key ? it : { ...it, included: !it.included }),
    }));
  };

  const editReviewItem = (targetPetId, key, field, value) => {
    setReviewGroups(groups => groups.map(g => g.petId !== targetPetId ? g : {
      ...g,
      items: g.items.map(it => it.key !== key ? it : { ...it, [field]: value }),
    }));
  };

  const handleConfirmReview = async () => {
    setReviewSaving(true);
    try {
      for (const group of reviewGroups) {
        for (const item of group.items) {
          if (!item.included) continue;
          const clean = {};
          ['vaccine_name', 'date_given', 'next_due_date', 'administered_by', 'lot_number', 'notes'].forEach(k => {
            if (item[k]) clean[k] = item[k];
          });
          if (item.matchedExistingId) {
            await entities.Vaccination.update(item.matchedExistingId, clean);
          } else {
            await entities.Vaccination.create({ pet_id: group.petId, ...clean });
          }
        }
      }
      setReviewGroups([]);
      load();
    } catch (err) {
      toast({ variant: 'destructive', description: aiErrorText(err) });
    } finally {
      setReviewSaving(false);
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
                      <span className="inline-flex items-center gap-1 text-[13px] px-2 py-0.5 rounded-full" style={{ background: status.background, color: status.color }}>
                        <Bell className="h-2.5 w-2.5" /> {status.label}
                      </span>
                    )}
                  </div>
                  {v.date_given && <p className="text-sm text-muted-foreground mt-0.5">Given: {format(parseISO(v.date_given), 'MMM d, yyyy')}</p>}
                  {v.administered_by && <p className="text-sm text-muted-foreground">By: {v.administered_by}</p>}
                  {v.notes && <p className="text-sm text-muted-foreground italic mt-0.5">{v.notes}</p>}
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
            <DialogTitle className="text-2xl">{editing ? 'Edit' : 'Add'} Vaccination</DialogTitle>
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
                    className={`text-[13px] px-2.5 py-1 rounded-full border transition-colors ${form.vaccine_name === s ? 'bg-primary text-primary-foreground border-primary' : 'bg-background text-muted-foreground border-border hover:border-primary/50'}`}>
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

      {reviewGroups.length > 0 && (
        <ScanReviewSheet
          groups={reviewGroups}
          saving={reviewSaving}
          onToggle={toggleReviewItem}
          onEdit={editReviewItem}
          onConfirm={handleConfirmReview}
          onClose={() => setReviewGroups([])}
        />
      )}
    </div>
  );
}