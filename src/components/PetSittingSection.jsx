import { useState, useEffect } from 'react';
import { entities } from '@/api/entities';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import {
  Plus, Home, ChevronDown, ChevronUp, Pencil, Trash2, Check, X, UserPlus,
  PawPrint, UtensilsCrossed, Pill, Syringe, ClipboardList, Siren, Stethoscope, FileText,
} from 'lucide-react';
import InviteSitterDialog from './InviteSitterDialog';
import PillToggle from './PillToggle';
import IconButton from './IconButton';
import { format } from 'date-fns';
import {
  sitDays, formatSitRange, validateSitDates, parseSitDate, openDatePicker,
  SIT_MIN_DATE, SIT_MAX_DATE,
} from '@/lib/sitDates';
import { useToast } from '@/components/ui/use-toast';
import { reportClientError } from '@/lib/errorMonitoring';

const EMPTY_FORM = {
  sitter_name: '', start_date: '', end_date: '',
  additional_instructions: '', emergency_contact: '', vet_contact: '',
  custom_tasks: [],
};

// Create one checklist log per sit day that doesn't have one yet (the
// checklist is sit-level, not per pet). sitDays() caps it at 31 days.
export async function ensureLogsForSit(sit, ents = entities) {
  const days = sitDays(sit);
  if (days.length === 0) return;
  const existing = await ents.PetSitLog.filter({ pet_sit_id: sit.id });
  const existingDates = new Set(existing.map(l => l.date));
  const toCreate = days
    .map(d => format(d, 'yyyy-MM-dd'))
    .filter(d => !existingDates.has(d))
    .map(d => ({ pet_sit_id: sit.id, pet_id: (sit.pet_ids || [])[0] || '', date: d }));
  if (toCreate.length > 0) await ents.PetSitLog.bulkCreate(toCreate);
}

/**
 * The Save steps of the sit dialog (spec 0085), kept out of the component so
 * they can be unit-tested. Never throws.
 * - dateError: a validateSitDates() message; nothing was written.
 * - error: a write failed; it has already been reported. If `sit` is also set,
 *   the sit exists (create succeeded but its checklist didn't), and the caller
 *   must use it as `editing` so a retry updates it instead of creating a
 *   duplicate (FR8, AC13).
 * @param {{ form: any, selectedPetIds: string[], editing: any, ents?: any, ensureLogs?: (sit: any, ents?: any) => Promise<void> }} args
 * @returns {Promise<{ sit: any, error: unknown, dateError: string | null }>}
 */
export async function saveSit({ form, selectedPetIds, editing, ents = entities, ensureLogs = ensureLogsForSit }) {
  const dateError = validateSitDates(form.start_date, form.end_date);
  if (dateError) return { sit: null, error: null, dateError };
  const data = { ...form, pet_ids: selectedPetIds };
  let sit = null;
  try {
    if (editing) {
      await ents.PetSit.update(editing.id, data);
      sit = { ...editing, ...data };
    } else {
      sit = await ents.PetSit.create(data);
    }
    await ensureLogs(sit, ents);
    return { sit, error: null, dateError: null };
  } catch (err) {
    reportClientError(err, { feature: 'pet-sitting', note: editing ? 'update' : 'create' });
    return { sit, error: err, dateError: null };
  }
}

// petId is optional — if provided, filters sits to those that include this pet
export default function PetSittingSection({ petId = undefined }) {
  const [sits, setSits] = useState([]);
  const [allPets, setAllPets] = useState([]);
  const [medicationsByPet, setMedicationsByPet] = useState({});
  const [foodsByPet, setFoodsByPet] = useState({});
  const [vaccinationsByPet, setVaccinationsByPet] = useState({});
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteSitId, setInviteSitId] = useState(null);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [selectedPetIds, setSelectedPetIds] = useState([]);
  const [saving, setSaving] = useState(false);
  const [expandedId, setExpandedId] = useState(null);
  const [sitLogs, setSitLogs] = useState({});
  const [newTask, setNewTask] = useState('');
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);
  const [dateError, setDateError] = useState(null);
  const { toast } = useToast();

  // quiet: refresh without the full-section "Loading..." swap, so an open
  // dialog stays mounted (used after a partial save failure).
  const load = async ({ quiet = false } = {}) => {
    if (!quiet) setLoading(true);
    const [pets, sitData] = await Promise.all([
      entities.Pet.list('-created_at'),
      entities.PetSit.list('-start_date', 50),
    ]);
    const activePets = pets.filter(c => !c.is_memorial);
    setAllPets(activePets);

    // Load meds/food/vax for all pets in parallel
    const petIds = activePets.map(c => c.id);
    const [medsAll, foodsAll, vacsAll] = await Promise.all([
      Promise.all(petIds.map(id => entities.Medication.filter({ pet_id: id, active: true }))),
      Promise.all(petIds.map(id => entities.PetFood.filter({ pet_id: id, active: true }))),
      Promise.all(petIds.map(id => entities.Vaccination.filter({ pet_id: id }))),
    ]);
    const medsMap = {}, foodsMap = {}, vacsMap = {};
    petIds.forEach((id, i) => {
      medsMap[id] = medsAll[i];
      foodsMap[id] = foodsAll[i];
      vacsMap[id] = vacsAll[i];
    });
    setMedicationsByPet(medsMap);
    setFoodsByPet(foodsMap);
    setVaccinationsByPet(vacsMap);

    // Filter sits: if petId prop provided, only show sits that include this pet
    const filtered = petId
      ? sitData.filter(s => (s.pet_ids || []).includes(petId))
      : sitData;
    setSits(filtered);
    if (!quiet) setLoading(false);
  };

  const loadSitLogs = async (sitId) => {
    const logs = await entities.PetSitLog.filter({ pet_sit_id: sitId });
    setSitLogs(prev => ({ ...prev, [sitId]: logs }));
  };

  const toggleExpand = (id) => {
    if (expandedId === id) { setExpandedId(null); return; }
    setExpandedId(id);
    loadSitLogs(id);
  };

  useEffect(() => { load(); }, [petId]);

  const setField = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const setDateField = (k, v) => { setDateError(null); setField(k, v); };

  const addTask = () => {
    const t = newTask.trim();
    if (!t) return;
    setForm(f => ({ ...f, custom_tasks: [...(f.custom_tasks || []), t] }));
    setNewTask('');
  };

  const removeTask = (i) => setForm(f => ({ ...f, custom_tasks: f.custom_tasks.filter((_, idx) => idx !== i) }));

  const openAdd = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    // Default: no pets selected
    setSelectedPetIds(petId ? [petId] : []);
    setNewTask('');
    setDateError(null);
    setDialogOpen(true);
  };

  const openEdit = (s) => {
    setEditing(s);
    setForm({
      sitter_name: s.sitter_name || '',
      start_date: s.start_date || '',
      end_date: s.end_date || '',
      additional_instructions: s.additional_instructions || '',
      emergency_contact: s.emergency_contact || '',
      vet_contact: s.vet_contact || '',
      custom_tasks: s.custom_tasks || [],
    });
    setSelectedPetIds(s.pet_ids || allPets.map(c => c.id));
    setNewTask('');
    setDateError(null);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    const message = validateSitDates(form.start_date, form.end_date);
    if (message) { setDateError(message); return; }
    setSaving(true);
    try {
      const result = await saveSit({ form, selectedPetIds, editing });
      if (result.dateError) { setDateError(result.dateError); return; }
      if (result.error) {
        // The sit exists even though a later step failed: keeping it as
        // `editing` makes a retry update it instead of creating a duplicate
        // (FR8). The quiet reload only makes the new sit visible in the list;
        // it doesn't stop New Pet Sit from creating another one. Quietly, so
        // the open dialog isn't unmounted behind the toast.
        if (result.sit) {
          setEditing(result.sit);
          load({ quiet: true }).catch(err => reportClientError(err, { feature: 'pet-sitting', note: 'reload' }));
        }
        toast({ variant: 'destructive', title: "Couldn't save this pet sit", description: 'Please try again.' });
        return;
      }
      setDialogOpen(false);
      load();
      setExpandedId(result.sit.id);
      loadSitLogs(result.sit.id);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    try {
      await entities.PetSit.delete(id);
      setDeleteConfirmId(null);
      load();
    } catch (err) {
      reportClientError(err, { feature: 'pet-sitting', note: 'delete' });
      toast({ variant: 'destructive', title: "Couldn't remove this sit", description: 'Please try again.' });
    }
  };

  const toggleBoolField = async (sit, log, field) => {
    await entities.PetSitLog.update(log.id, { [field]: !log[field] });
    setSitLogs(prev => ({
      ...prev,
      [sit.id]: prev[sit.id].map(l => l.id === log.id ? { ...l, [field]: !l[field] } : l),
    }));
  };

  const toggleTask = async (sit, log, task) => {
    const current = log.completed_tasks || [];
    const updated = current.includes(task) ? current.filter(t => t !== task) : [...current, task];
    await entities.PetSitLog.update(log.id, { completed_tasks: updated });
    setSitLogs(prev => ({
      ...prev,
      [sit.id]: prev[sit.id].map(l => l.id === log.id ? { ...l, completed_tasks: updated } : l),
    }));
  };

  const togglePetSelection = (id) => {
    setSelectedPetIds(prev =>
      prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]
    );
  };

  if (loading) return <div className="py-10 text-center text-muted-foreground text-sm">Loading...</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{sits.length} sitting period{sits.length !== 1 ? 's' : ''}</p>
        <Button size="sm" onClick={openAdd}><Plus className="h-4 w-4 mr-1" /> New Pet Sit</Button>
      </div>

      {sits.length === 0 ? (
        <div className="text-center py-12">
          <Home className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">No pet sitting periods yet.</p>
          <p className="text-sm text-muted-foreground/70 mt-1">Create one to generate sitter instructions and a daily checklist.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {sits.map(sit => {
            const sitPetIds = sit.pet_ids || [];
            return (
              <SitCard
                key={sit.id}
                sit={sit}
                sitPets={allPets.filter(c => sitPetIds.includes(c.id))}
                logs={sitLogs[sit.id] || []}
                expanded={expandedId === sit.id}
                medicationsByPet={medicationsByPet}
                foodsByPet={foodsByPet}
                vaccinationsByPet={vaccinationsByPet}
                onToggleExpand={() => toggleExpand(sit.id)}
                onInvite={() => { setInviteSitId(sit.id); setInviteOpen(true); }}
                onEdit={() => openEdit(sit)}
                onDelete={() => setDeleteConfirmId(sit.id)}
                onToggleBool={(log, field) => toggleBoolField(sit, log, field)}
                onToggleTask={(log, task) => toggleTask(sit, log, task)}
              />
            );
          })}
        </div>
      )}

      <InviteSitterDialog
        petSitId={inviteSitId}
        open={inviteOpen}
        onOpenChange={setInviteOpen}
      />

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-2xl">{editing ? 'Edit' : 'New'} Pet Sitting Period</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">

            {/* Pet selection */}
            {allPets.length > 1 && (
              <div className="space-y-2">
                <Label>Pets on this sit</Label>
                <div className="flex flex-wrap gap-2">
                  {allPets.map(pet => (
                    <PillToggle
                      key={pet.id}
                      active={selectedPetIds.includes(pet.id)}
                      onClick={() => togglePetSelection(pet.id)}
                      className="text-sm px-3 py-1.5 min-h-[44px]"
                    >
                      {selectedPetIds.includes(pet.id) && <Check className="h-3 w-3" />}
                      {pet.name}
                    </PillToggle>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <Label>Sitter Name</Label>
              <Input value={form.sitter_name} onChange={e => setField('sitter_name', e.target.value)} placeholder="e.g. Sarah" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Start Date *</Label>
                <Input
                  type="date"
                  value={form.start_date}
                  min={SIT_MIN_DATE}
                  max={SIT_MAX_DATE}
                  onClick={openDatePicker}
                  onChange={e => setDateField('start_date', e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>End Date *</Label>
                <Input
                  type="date"
                  value={form.end_date}
                  min={parseSitDate(form.start_date) ? form.start_date : SIT_MIN_DATE}
                  max={SIT_MAX_DATE}
                  onClick={openDatePicker}
                  onChange={e => setDateField('end_date', e.target.value)}
                />
              </div>
            </div>
            {dateError && <p role="alert" className="text-[13px] text-destructive -mt-2">{dateError}</p>}
            <div className="space-y-1.5">
              <Label>Emergency Contact</Label>
              <Input value={form.emergency_contact} onChange={e => setField('emergency_contact', e.target.value)} placeholder="Name & phone" />
            </div>
            <div className="space-y-1.5">
              <Label>Vet Contact</Label>
              <Input value={form.vet_contact} onChange={e => setField('vet_contact', e.target.value)} placeholder="Clinic name & phone" />
            </div>

            <div className="space-y-2">
              <Label>Custom Daily Tasks</Label>
              {(form.custom_tasks || []).length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {form.custom_tasks.map((t, i) => (
                    <span key={i} className="flex items-center gap-1 text-[13px] bg-secondary px-2.5 py-1 rounded-full">
                      {t}
                      <IconButton
                        variant="plain"
                        icon={X}
                        iconClassName="h-3.5 w-3.5 text-muted-foreground group-hover:text-destructive transition-colors"
                        className="group -my-3 -mr-3"
                        aria-label={`Remove ${t}`}
                        onClick={() => removeTask(i)}
                      />
                    </span>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <Input
                  value={newTask}
                  onChange={e => setNewTask(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTask(); } }}
                  placeholder="e.g. Change water, Clean litter..."
                  className="text-sm"
                />
                <Button type="button" variant="outline" size="sm" onClick={addTask} disabled={!newTask.trim()}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Additional Instructions</Label>
              <Textarea value={form.additional_instructions} onChange={e => setField('additional_instructions', e.target.value)} rows={3} placeholder="Hiding spots, favorite toys, behavioral notes..." />
            </div>
            <Button onClick={handleSave} className="w-full" disabled={saving || !form.start_date || !form.end_date || selectedPetIds.length === 0}>
              {saving ? 'Saving & creating daily logs...' : editing ? 'Save Changes' : 'Create & Generate Checklist'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteConfirmId} onOpenChange={(v) => !v && setDeleteConfirmId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-2xl">Remove this sit?</AlertDialogTitle>
            <AlertDialogDescription className="text-base leading-relaxed">
              This removes the pet-sitting arrangement and its checklist. This can't be undone, but you can create a new sit any time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Button variant="destructive" onClick={() => handleDelete(deleteConfirmId)}>Remove</Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// One sit's header and (when expanded) its instructions and daily checklist.
// Exported so it can be render-tested without the page's data load (spec 0085).
// The dates go through sitDates.js, so an unusable saved date shows
// "Dates not set" and builds no checklist instead of crashing the page.
export function SitCard({
  sit, sitPets, logs, expanded, medicationsByPet, foodsByPet, vaccinationsByPet,
  onToggleExpand, onInvite, onEdit, onDelete, onToggleBool, onToggleTask,
}) {
  const days = sitDays(sit);
  const customTasks = sit.custom_tasks || [];
  const hasPmMed = sitPets.some(pet => (medicationsByPet[pet.id] || []).some(m => m.frequency === 'Twice daily'));

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-4 py-3 cursor-pointer" onClick={onToggleExpand}>
        <div className="min-w-0 flex-1 break-words">
          <p className="font-medium text-sm">
            {formatSitRange(sit)}
          </p>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            {sit.sitter_name && <p className="text-sm text-muted-foreground">Sitter: {sit.sitter_name}</p>}
            {sitPets.length > 0 && (
              <p className="flex items-center gap-1 text-sm text-muted-foreground">
                <PawPrint className="h-3.5 w-3.5" /> {sitPets.map(c => c.name).join(', ')}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center flex-shrink-0">
          <IconButton
            variant="plain"
            icon={UserPlus}
            className="group"
            iconClassName="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary transition-colors"
            aria-label="Share with sitter"
            title="Share with sitter"
            onClick={e => { e.stopPropagation(); onInvite(); }}
          />
          <IconButton
            variant="plain"
            icon={Pencil}
            className="group"
            iconClassName="h-3.5 w-3.5 text-muted-foreground group-hover:text-foreground transition-colors"
            aria-label="Edit sit"
            onClick={e => { e.stopPropagation(); onEdit(); }}
          />
          <IconButton
            variant="plain"
            icon={Trash2}
            className="group"
            iconClassName="h-3.5 w-3.5 text-muted-foreground group-hover:text-destructive transition-colors"
            aria-label="Delete sit"
            onClick={e => { e.stopPropagation(); onDelete(); }}
          />
          {expanded ? <ChevronUp className="h-4 w-4 ml-1 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 ml-1 text-muted-foreground" />}
        </div>
      </div>

      {expanded && (
        <div className="border-t border-border px-4 py-4 space-y-5">
          {/* Instructions summary — per pet */}
          <div className="bg-secondary/50 rounded-lg p-3 space-y-3 text-sm">
            <p className="font-semibold text-[13px] uppercase tracking-wider text-muted-foreground">Sitter Instructions</p>
            {sitPets.map(pet => {
              const meds = medicationsByPet[pet.id] || [];
              const foods = foodsByPet[pet.id] || [];
              const vacs = vaccinationsByPet[pet.id] || [];
              return (
                <div key={pet.id} className="space-y-1.5 border-l-2 border-primary/30 pl-3">
                  <p className="flex items-center gap-1 font-semibold text-sm"><PawPrint className="h-3.5 w-3.5" /> {pet.name}</p>
                  {foods.length > 0 && (
                    <div>
                      <p className="flex items-center gap-1 font-medium text-sm"><UtensilsCrossed className="h-3.5 w-3.5" /> Food:</p>
                      <ul className="ml-3 text-muted-foreground text-sm space-y-0.5">
                        {foods.map(f => <li key={f.id}>• {f.name}{f.brand ? ` (${f.brand})` : ''}{f.food_type ? ` — ${f.food_type}` : ''}</li>)}
                      </ul>
                    </div>
                  )}
                  {meds.length > 0 && (
                    <div>
                      <p className="flex items-center gap-1 font-medium text-sm"><Pill className="h-3.5 w-3.5" /> Medications:</p>
                      <ul className="ml-3 text-muted-foreground text-sm space-y-0.5">
                        {meds.map(m => <li key={m.id}>• {m.name}{m.dosage ? ` — ${m.dosage}` : ''}{m.frequency ? `, ${m.frequency}` : ''}{m.timing_instructions ? ` (${m.timing_instructions})` : ''}</li>)}
                      </ul>
                    </div>
                  )}
                  {vacs.length > 0 && (
                    <div>
                      <p className="flex items-center gap-1 font-medium text-sm"><Syringe className="h-3.5 w-3.5" /> Vaccinations on file:</p>
                      <ul className="ml-3 text-muted-foreground text-sm space-y-0.5">
                        {vacs.map(v => <li key={v.id}>• {v.vaccine_name}{v.next_due_date ? ` · due ${v.next_due_date}` : ''}</li>)}
                      </ul>
                    </div>
                  )}
                </div>
              );
            })}
            {customTasks.length > 0 && (
              <div>
                <p className="flex items-center gap-1 font-medium text-sm"><ClipboardList className="h-3.5 w-3.5" /> Daily Tasks:</p>
                <ul className="ml-3 text-muted-foreground text-sm space-y-0.5">{customTasks.map((t, i) => <li key={i}>• {t}</li>)}</ul>
              </div>
            )}
            {sit.emergency_contact && <p className="flex items-center gap-1 text-sm"><span className="flex items-center gap-1 font-medium"><Siren className="h-3.5 w-3.5" /> Emergency:</span> <span className="text-muted-foreground">{sit.emergency_contact}</span></p>}
            {sit.vet_contact && <p className="flex items-center gap-1 text-sm"><span className="flex items-center gap-1 font-medium"><Stethoscope className="h-3.5 w-3.5" /> Vet:</span> <span className="text-muted-foreground">{sit.vet_contact}</span></p>}
            {sit.additional_instructions && (
              <div>
                <p className="flex items-center gap-1 font-medium text-sm"><FileText className="h-3.5 w-3.5" /> Additional Notes:</p>
                <p className="text-muted-foreground text-sm ml-3">{sit.additional_instructions}</p>
              </div>
            )}
          </div>

          {/* Daily Checklist */}
          {days.length > 0 && (
            <div>
              <p className="font-semibold text-[13px] uppercase tracking-wider text-muted-foreground mb-3">Daily Checklist</p>
              <div className="space-y-3">
                {days.map(day => {
                  const dateStr = format(day, 'yyyy-MM-dd');
                  const log = logs.find(l => l.date === dateStr);
                  if (!log) return (
                    <div key={dateStr} className="text-sm text-muted-foreground py-1">{format(day, 'EEE M/d')} — loading...</div>
                  );
                  return (
                    <div key={dateStr} className="space-y-2">
                      <p className="text-sm font-medium text-muted-foreground">{format(day, 'EEEE, MMMM d')}</p>
                      <div className="flex gap-2 flex-wrap">
                        <CheckBtn label="AM Food" checked={!!log.am_food_given} onToggle={() => onToggleBool(log, 'am_food_given')} />
                        <CheckBtn label="PM Food" checked={!!log.pm_food_given} onToggle={() => onToggleBool(log, 'pm_food_given')} />
                        {sitPets.some(pet => (medicationsByPet[pet.id] || []).length > 0) && (
                          <CheckBtn label="AM Meds" checked={!!log.am_meds_given} onToggle={() => onToggleBool(log, 'am_meds_given')} />
                        )}
                        {hasPmMed && <CheckBtn label="PM Meds" checked={!!log.pm_meds_given} onToggle={() => onToggleBool(log, 'pm_meds_given')} />}
                        {customTasks.map(task => (
                          <CheckBtn
                            key={task}
                            label={task}
                            checked={(log.completed_tasks || []).includes(task)}
                            onToggle={() => onToggleTask(log, task)}
                          />
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function CheckBtn({ label, checked, onToggle }) {
  return (
    <PillToggle active={checked} onClick={onToggle} className="text-[13px] px-2.5 py-1.5 min-h-[44px]">
      {checked ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
      {label}
    </PillToggle>
  );
}