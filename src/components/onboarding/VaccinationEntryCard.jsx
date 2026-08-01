import { useState } from 'react';
import { Camera, Check, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { entities } from '@/api/entities';
import { uploadFile } from '@/api/storageClient';
import { invokeAI } from '@/api/aiClient';
import { getVaccines } from '@/lib/speciesConfig';

const emptyEntry = (petId) => ({ pet_id: petId, vaccine_name: '', date_given: '', next_due_date: '', administered_by: '', lot_number: '', notes: '' });

// New onboarding step (spec 0029 FR-011). Repeatable, modeled directly on
// MedicationEntryCard: each save creates a real row in the existing
// vaccinations table (entities.Vaccination) rather than an onboarding-only
// shape, so it shows up immediately in the Vaccinations tab.
//
// Scan reuses the same invokeAI + ask-vet-assistant prompt/schema
// VaccinationSection.jsx already proved out for a single vaccine record —
// but unlike that component (which saves scan results immediately), this
// only pre-fills the manual form below, so the owner reviews and taps
// Add/Continue before anything is written (FR-011: scanned values are
// never saved automatically).
export default function VaccinationEntryCard({ petId, petName, species, onContinue, onSkip, disabled }) {
  const [form, setForm] = useState(emptyEntry(petId));
  const [saved, setSaved] = useState([]);
  const [saving, setSaving] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState(null);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const canSave = form.vaccine_name.trim().length > 0;
  const busy = saving || disabled || scanning;
  const suggestions = getVaccines(species);

  const handleScan = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setScanning(true);
    setError(null);
    try {
      const { file_url } = await uploadFile({ file });
      const result = await invokeAI({
        prompt: 'You are analyzing a photo of a single vaccination record or certificate. Extract only the fields clearly visible: vaccine_name, date_given (YYYY-MM-DD), next_due_date (YYYY-MM-DD), administered_by (vet/clinic name), lot_number.',
        file_urls: [file_url],
        response_json_schema: {
          type: 'object',
          properties: {
            vaccine_name: { type: 'string' },
            date_given: { type: 'string' },
            next_due_date: { type: 'string' },
            administered_by: { type: 'string' },
            lot_number: { type: 'string' },
          },
        },
      });
      setForm((f) => ({
        ...f,
        vaccine_name: result?.vaccine_name || f.vaccine_name,
        date_given: result?.date_given || f.date_given,
        next_due_date: result?.next_due_date || f.next_due_date,
        administered_by: result?.administered_by || f.administered_by,
        lot_number: result?.lot_number || f.lot_number,
      }));
    } catch (err) {
      console.error('Failed to scan vaccination record:', err);
      setError("Couldn't read that record — you can still enter it manually below.");
    } finally {
      setScanning(false);
      e.target.value = '';
    }
  };

  const saveCurrent = async () => {
    if (!canSave) return null;
    setSaving(true);
    setError(null);
    try {
      const created = await entities.Vaccination.create({
        ...form,
        vaccine_name: form.vaccine_name.trim(),
        date_given: form.date_given || null,
        next_due_date: form.next_due_date || null,
        administered_by: form.administered_by.trim() || null,
        lot_number: form.lot_number.trim() || null,
        notes: form.notes.trim() || null,
      });
      return created;
    } catch (err) {
      console.error('Failed to save vaccination:', err);
      setError("Couldn't save that vaccination — check your connection and try again.");
      return null;
    } finally {
      setSaving(false);
    }
  };

  const handleAddAnother = async () => {
    const created = await saveCurrent();
    if (!created) return;
    setSaved((prev) => [...prev, created]);
    setForm(emptyEntry(petId));
  };

  const handleContinue = async () => {
    if (canSave) {
      const created = await saveCurrent();
      if (!created) return;
      setSaved((prev) => [...prev, created]);
    }
    onContinue();
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="space-y-1.5">
        <p className="text-xs font-semibold uppercase tracking-widest text-primary/70">Vaccinations</p>
        <h2 className="text-2xl font-semibold text-foreground leading-snug">
          Add {petName}'s vaccinations
        </h2>
        <p className="text-sm text-muted-foreground">Add each vaccination one at a time.</p>
      </div>

      {saved.length > 0 && (
        <div className="flex flex-col gap-2">
          {saved.map((v) => (
            <div key={v.id} className="flex items-center gap-3 px-4 py-3 rounded-xl bg-card border border-border">
              <Check className="h-4 w-4 text-primary flex-shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground truncate">{v.vaccine_name}</p>
                {v.date_given && <p className="text-sm text-muted-foreground">Given {v.date_given}</p>}
              </div>
            </div>
          ))}
        </div>
      )}

      <label className="flex items-center justify-center gap-2 w-full min-h-[52px] rounded-2xl border-2 border-dashed border-primary/40 text-primary font-medium text-sm cursor-pointer">
        {scanning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
        {scanning ? 'Reading record...' : 'Scan Vaccination Record'}
        <input type="file" accept="image/*,.pdf" className="hidden" onChange={handleScan} disabled={busy} />
      </label>
      <p className="text-xs text-muted-foreground text-center -mt-4">or enter manually below — review and confirm before saving</p>

      <div className="space-y-4 p-4 rounded-2xl bg-card border border-border">
        <div className="space-y-1.5">
          <Label className="text-sm">Vaccine name</Label>
          <Input
            list="onboarding-vaccine-suggestions"
            value={form.vaccine_name}
            onChange={(e) => set('vaccine_name', e.target.value)}
            placeholder="e.g. Rabies"
          />
          <datalist id="onboarding-vaccine-suggestions">
            {suggestions.map((v) => <option key={v} value={v} />)}
          </datalist>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-sm">Date given</Label>
            <Input type="date" value={form.date_given} onChange={(e) => set('date_given', e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm">Next due</Label>
            <Input type="date" value={form.next_due_date} onChange={(e) => set('next_due_date', e.target.value)} />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label className="text-sm">Administered by</Label>
          <Input value={form.administered_by} onChange={(e) => set('administered_by', e.target.value)} placeholder="Optional" />
        </div>
        <Button type="button" variant="outline" className="w-full min-h-[48px]" disabled={!canSave || busy} onClick={handleAddAnother}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
          Add Another Vaccination
        </Button>
      </div>

      {error && <p className="text-sm text-destructive" role="alert">{error}</p>}

      <div className="flex flex-col gap-2">
        <Button className="w-full min-h-[52px] text-base" disabled={busy} onClick={handleContinue}>
          Continue
        </Button>
        <Button type="button" variant="ghost" className="w-full text-muted-foreground" disabled={busy} onClick={onSkip}>
          <X className="h-3.5 w-3.5 mr-1" /> Skip
        </Button>
      </div>
    </div>
  );
}
