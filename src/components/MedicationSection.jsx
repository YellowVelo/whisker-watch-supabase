import { useState, useEffect } from 'react';
import { entities } from '@/api/entities';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Plus, Pencil, X, ShieldCheck, CheckCircle2, Bug, Heart } from 'lucide-react';
import { format, parseISO, addMonths, addWeeks } from 'date-fns';
import SmartSelect from './SmartSelect';

const today = () => new Date().toISOString().split('T')[0];
const emptyMed = (petId) => ({ pet_id: petId, name: '', med_type: 'General', prescribed: false, dosage: '', frequency: '', timing_instructions: '', route: '', start_date: today(), next_due_date: '', end_date: '', prescribing_vet: '', active: true, reminder_enabled: false, notes: '' });

const FREQUENCIES_WITH_NEXT_DUE = ['Monthly', 'Every 3 months'];

const computeNextDue = (startDate, frequency) => {
  if (!startDate || !FREQUENCIES_WITH_NEXT_DUE.includes(frequency)) return '';
  const base = parseISO(startDate);
  if (frequency === 'Monthly') return format(addMonths(base, 1), 'yyyy-MM-dd');
  if (frequency === 'Every 3 months') return format(addMonths(base, 3), 'yyyy-MM-dd');
  return '';
};

const MED_TYPE_BADGE = {
  'Flea & Tick': { label: '🐛 Flea & Tick', classes: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300' },
  'Heartworm':   { label: '❤️ Heartworm',   classes: 'bg-pink-100 text-pink-700 dark:bg-pink-900/40 dark:text-pink-300' },
};

export default function MedicationSection({ petId }) {
  const [meds, setMeds] = useState([]);
  const [showDialog, setShowDialog] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyMed(petId));
  const [saving, setSaving] = useState(false);
  const [showInactive, setShowInactive] = useState(false);
  const [givenToday, setGivenToday] = useState(new Set());

  const load = async () => {
    const data = await entities.Medication.filter({ pet_id: petId }, '-start_date');
    setMeds(data);
  };

  useEffect(() => { load(); }, [petId]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const openAdd = () => { setForm(emptyMed(petId)); setEditing(null); setShowDialog(true); };
  const openEdit = (med) => { setForm({ ...med }); setEditing(med.id); setShowDialog(true); };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    const data = { ...form };
    if (!data.end_date) delete data.end_date;
    if (!data.prescribing_vet) delete data.prescribing_vet;
    if (editing) await entities.Medication.update(editing, data);
    else await entities.Medication.create(data);
    setSaving(false);
    setShowDialog(false);
    load();
  };

  const deleteMed = async (id) => {
    await entities.Medication.delete(id);
    load();
  };

  const markGiven = (id) => {
    setGivenToday(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const active = meds.filter(m => m.active);
  const inactive = meds.filter(m => !m.active);

  return (
    <div className="space-y-5">
      {/* Active meds as tappable buttons */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">
            Active Medications ({active.length})
          </h3>
          <Button size="sm" variant="outline" onClick={openAdd}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Add Med
          </Button>
        </div>

        {active.length === 0 ? (
          <div className="text-center py-8 border border-dashed border-border rounded-xl">
            <p className="text-sm text-muted-foreground">No active medications.</p>
            <button onClick={openAdd} className="text-sm text-primary mt-1 underline">Add first medication</button>
          </div>
        ) : (
          <div className="space-y-2">
            {active.map(med => (
              <MedButton
                key={med.id}
                med={med}
                given={givenToday.has(med.id)}
                onGive={() => markGiven(med.id)}
                onEdit={() => openEdit(med)}
                onDelete={() => deleteMed(med.id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Past meds */}
      {inactive.length > 0 && (
        <div>
          <button
            onClick={() => setShowInactive(!showInactive)}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
          >
            {showInactive ? '▾' : '▸'} Past medications ({inactive.length})
          </button>
          {showInactive && (
            <div className="space-y-2 mt-2 opacity-60">
              {inactive.map(med => (
                <MedButton key={med.id} med={med} given={false} onGive={() => {}} onEdit={() => openEdit(med)} onDelete={() => deleteMed(med.id)} past />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Add/Edit dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="sm:max-w-md overflow-y-auto max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="font-serif text-xl">{editing ? 'Edit Medication' : 'Add Medication'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-sm">Name *</Label>
              <Input value={form.name} onChange={e => set('name', e.target.value)} placeholder="e.g. Prednisolone" required />
            </div>

            {/* Medication Type */}
            <div className="space-y-1.5">
              <Label className="text-sm">Medication Type</Label>
              <div className="flex gap-2">
                {['General', 'Flea & Tick', 'Heartworm'].map(type => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => set('med_type', type)}
                    className={`flex-1 text-xs py-2 px-2 rounded-lg border transition-colors ${
                      form.med_type === type
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-background border-border text-muted-foreground hover:border-primary/50'
                    }`}
                  >
                    {type === 'Flea & Tick' ? '🐛 Flea & Tick' : type === 'Heartworm' ? '❤️ Heartworm' : '💊 General'}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-sm">Dosage</Label>
                <Input value={form.dosage} onChange={e => set('dosage', e.target.value)} placeholder="e.g. 5mg" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">Frequency</Label>
                <SmartSelect value={form.frequency} onValueChange={v => {
                  const nextDue = computeNextDue(form.start_date, v);
                  setForm(f => ({ ...f, frequency: v, next_due_date: nextDue }));
                }} placeholder="How often?" options={['Once daily', 'Twice daily', 'Every other day', 'Weekly', 'Monthly', 'Every 3 months', 'As needed', 'Other']} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">Timing Instructions</Label>
              <Input value={form.timing_instructions} onChange={e => set('timing_instructions', e.target.value)} placeholder="e.g. With food, morning" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">Route</Label>
              <SmartSelect value={form.route} onValueChange={v => set('route', v)} placeholder="How given?" options={['Oral', 'Subcutaneous injection', 'Transdermal', 'Topical', 'Eye drops', 'Ear drops', 'Other']} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-sm">Start Date</Label>
                <Input type="date" value={form.start_date} onChange={e => {
                  const nextDue = computeNextDue(e.target.value, form.frequency);
                  setForm(f => ({ ...f, start_date: e.target.value, next_due_date: nextDue }));
                }} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">Stop Date</Label>
                <Input type="date" value={form.end_date} onChange={e => set('end_date', e.target.value)} />
              </div>
            </div>
            {FREQUENCIES_WITH_NEXT_DUE.includes(form.frequency) && (
              <div className="space-y-1.5">
                <Label className="text-sm">Next Due Date</Label>
                <Input type="date" value={form.next_due_date} onChange={e => set('next_due_date', e.target.value)} />
                <p className="text-sm text-muted-foreground">Auto-calculated — adjust if needed.</p>
              </div>
            )}
            <div className="space-y-1.5">
              <Label className="text-sm">Prescribing Vet</Label>
              <Input value={form.prescribing_vet} onChange={e => set('prescribing_vet', e.target.value)} placeholder="Dr. Smith" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">Notes</Label>
              <Textarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={2} />
            </div>
            <div className="flex items-center justify-between p-3 bg-secondary rounded-lg">
              <div>
                <p className="text-sm font-medium">Prescribed by Vet</p>
                <p className="text-sm text-muted-foreground">Vet-prescribed medication</p>
              </div>
              <Switch checked={form.prescribed} onCheckedChange={v => set('prescribed', v)} />
            </div>
            <div className="flex items-center justify-between p-3 bg-secondary rounded-lg">
              <div>
                <p className="text-sm font-medium">Currently Active</p>
                <p className="text-sm text-muted-foreground">Still being administered</p>
              </div>
              <Switch checked={form.active} onCheckedChange={v => set('active', v)} />
            </div>
            <div className="flex items-center justify-between p-3 bg-secondary rounded-lg">
              <div>
                <p className="text-sm font-medium">Reminder</p>
                <p className="text-sm text-muted-foreground">Get notified when it's due</p>
              </div>
              <Switch checked={form.reminder_enabled} onCheckedChange={v => set('reminder_enabled', v)} />
            </div>
            <Button type="submit" className="w-full min-h-[44px]" disabled={saving || !form.name.trim()}>
              {saving ? 'Saving...' : editing ? 'Save Changes' : 'Add to Medication List'}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function MedButton({ med, given, onGive, onEdit, onDelete, past }) {
  return (
    <div className={`border rounded-xl overflow-hidden transition-all ${given ? 'border-primary/40 bg-primary/5' : 'border-border bg-card'}`}>
      {/* Main tap area */}
      {!past && (
        <button
          onClick={onGive}
          className={`w-full flex items-center gap-3 px-4 py-3.5 text-left transition-colors active:scale-[0.99] active:opacity-80 min-h-[60px] ${given ? 'bg-primary/5' : 'hover:bg-secondary/50'}`}
        >
          <div className={`h-8 w-8 rounded-full flex items-center justify-center flex-shrink-0 transition-colors ${given ? 'bg-primary text-primary-foreground' : 'bg-secondary'}`}>
            <CheckCircle2 className="h-4 w-4" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
                              <p className="text-sm font-semibold">{med.name}</p>
                              {med.prescribed && (
                                <span className="flex items-center gap-0.5 text-xs bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300 px-1.5 py-0.5 rounded-full">
                                  <ShieldCheck className="h-2.5 w-2.5" /> Rx
                                </span>
                              )}
                              {MED_TYPE_BADGE[med.med_type] && (
                                <span className={`text-xs px-1.5 py-0.5 rounded-full ${MED_TYPE_BADGE[med.med_type].classes}`}>
                                  {MED_TYPE_BADGE[med.med_type].label}
                                </span>
                              )}
                            </div>
            <div className="flex flex-wrap gap-x-2 gap-y-0.5 mt-0.5">
              {med.dosage && <p className="text-sm text-muted-foreground">{med.dosage}</p>}
              {med.frequency && <p className="text-sm text-muted-foreground">{med.frequency}</p>}
              {med.timing_instructions && <p className="text-sm text-muted-foreground">{med.timing_instructions}</p>}
            </div>
          </div>
          <span className={`text-sm font-medium flex-shrink-0 ${given ? 'text-primary' : 'text-muted-foreground'}`}>
            {given ? 'Given ✓' : 'Tap to log'}
          </span>
        </button>
      )}

      {past && (
        <div className="flex items-center gap-3 px-4 py-3 min-h-[52px]">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <p className="text-sm font-medium">{med.name}</p>
              {med.prescribed && (
                <span className="flex items-center gap-0.5 text-xs bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300 px-1.5 py-0.5 rounded-full">
                  <ShieldCheck className="h-2.5 w-2.5" /> Rx
                </span>
              )}
            </div>
            {(med.dosage || med.frequency) && (
              <p className="text-sm text-muted-foreground">{[med.dosage, med.frequency].filter(Boolean).join(' · ')}</p>
            )}
          </div>
        </div>
      )}

      {/* Edit / delete row */}
      <div className="flex items-center justify-between px-4 py-1.5 border-t border-border/50 bg-muted/30">
        <div className="flex items-center gap-2 flex-wrap">
          {med.next_due_date && (
            <p className="text-sm font-medium text-accent">
              📅 Due {format(parseISO(med.next_due_date), 'MMM d, yyyy')}
            </p>
          )}
          {!med.next_due_date && (med.start_date || med.end_date) && (
            <p className="text-sm text-muted-foreground">
              {med.start_date && format(parseISO(med.start_date), 'MMM d, yyyy')}
              {med.end_date && ` → ${format(parseISO(med.end_date), 'MMM d, yyyy')}`}
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <button onClick={onEdit} className="text-muted-foreground hover:text-foreground transition-colors p-1">
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button onClick={onDelete} className="text-muted-foreground hover:text-destructive transition-colors p-1">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}