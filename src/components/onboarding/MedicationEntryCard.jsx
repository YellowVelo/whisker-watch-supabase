import { useState } from 'react';
import { Check, Loader2, Pill, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import SmartSelect from '@/components/SmartSelect';
import { entities } from '@/api/entities';
import { FREQUENCY_OPTIONS } from '@/lib/onboardingConfig';

const emptyEntry = (petId) => ({ pet_id: petId, name: '', dosage: '', frequency: '', reminder_enabled: false });

// Card 4: Medication Entry. Repeatable — each save creates a row in the
// existing medications table (entities.Medication) rather than a
// onboarding-only shape, so it shows up immediately in the Medications tab.
export default function MedicationEntryCard({ petId, petName, onContinue, onSkip, disabled }) {
  const [form, setForm] = useState(emptyEntry(petId));
  const [saved, setSaved] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const canSave = form.name.trim().length > 0;
  const busy = saving || disabled;

  const saveCurrent = async () => {
    if (!canSave) return null;
    setSaving(true);
    setError(null);
    try {
      const created = await entities.Medication.create({
        ...form,
        name: form.name.trim(),
        dosage: form.dosage.trim() || null,
        frequency: form.frequency || null, // '' would violate medications_frequency_check
      });
      return created;
    } catch (err) {
      console.error('Failed to save medication:', err);
      setError("Couldn't save that medication — check your connection and try again.");
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
      if (!created) return; // save failed — stay on this card, don't advance
      setSaved((prev) => [...prev, created]);
    }
    onContinue();
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="space-y-1.5">
        <p className="text-xs font-semibold uppercase tracking-widest text-primary/70">Medications</p>
        <h2 className="font-serif text-2xl text-foreground leading-snug">
          What is {petName} currently taking?
        </h2>
        <p className="text-sm text-muted-foreground">Add each medication one at a time.</p>
      </div>

      {saved.length > 0 && (
        <div className="flex flex-col gap-2">
          {saved.map((m) => (
            <div key={m.id} className="flex items-center gap-3 px-4 py-3 rounded-xl bg-card border border-border">
              <Check className="h-4 w-4 text-primary flex-shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground truncate">{m.name}</p>
                {(m.dosage || m.frequency) && (
                  <p className="text-xs text-muted-foreground">{[m.dosage, m.frequency].filter(Boolean).join(' · ')}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="space-y-4 p-4 rounded-2xl bg-card border border-border">
        <div className="space-y-1.5">
          <Label className="text-sm">Medication name</Label>
          <Input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Prednisolone" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-sm">Dose</Label>
            <Input value={form.dosage} onChange={(e) => set('dosage', e.target.value)} placeholder="e.g. 5mg" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm">Frequency</Label>
            <SmartSelect value={form.frequency} onValueChange={(v) => set('frequency', v)} placeholder="How often?" options={FREQUENCY_OPTIONS} />
          </div>
        </div>
        <div className="flex items-center justify-between p-3 bg-secondary rounded-lg">
          <div className="flex items-center gap-2">
            <Pill className="h-4 w-4 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium">Reminder</p>
              <p className="text-xs text-muted-foreground">Get notified when it's due</p>
            </div>
          </div>
          <Switch checked={form.reminder_enabled} onCheckedChange={(v) => set('reminder_enabled', v)} />
        </div>
        <Button type="button" variant="outline" className="w-full min-h-[48px]" disabled={!canSave || busy} onClick={handleAddAnother}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
          Add Another Medication
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
