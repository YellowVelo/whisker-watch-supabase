import { useState, useEffect } from 'react';
import { entities } from '@/api/entities';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Plus, Home, ChevronDown, ChevronUp, Pencil, Trash2, Check, X, UserPlus } from 'lucide-react';
import InviteSitterDialog from './InviteSitterDialog';
import { format, parseISO, eachDayOfInterval } from 'date-fns';

const EMPTY_FORM = {
  sitter_name: '', start_date: '', end_date: '',
  additional_instructions: '', emergency_contact: '', vet_contact: '',
  custom_tasks: [],
};

// petId is optional — if provided, filters sits to those that include this pet
export default function PetSittingSection({ petId }) {
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

  const load = async () => {
    setLoading(true);
    const [pets, sitData] = await Promise.all([
      entities.Pet.list('-created_date'),
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
    setLoading(false);
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

  const ensureLogsForSit = async (sit) => {
    if (!sit.start_date || !sit.end_date) return;
    const days = eachDayOfInterval({ start: parseISO(sit.start_date), end: parseISO(sit.end_date) });
    const existing = await entities.PetSitLog.filter({ pet_sit_id: sit.id });
    const existingDates = new Set(existing.map(l => l.date));
    // Create one log per day (not per pet — the checklist is sit-level)
    const toCreate = days
      .map(d => format(d, 'yyyy-MM-dd'))
      .filter(d => !existingDates.has(d))
      .map(d => ({ pet_sit_id: sit.id, pet_id: (sit.pet_ids || [])[0] || '', date: d }));
    if (toCreate.length > 0) await entities.PetSitLog.bulkCreate(toCreate);
  };

  useEffect(() => { load(); }, [petId]);

  const setField = (k, v) => setForm(f => ({ ...f, [k]: v }));

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
    setDialogOpen(true);
  };

  const handleSave = async () => {
    setSaving(true);
    const data = { ...form, pet_ids: selectedPetIds };
    let sit;
    if (editing) {
      await entities.PetSit.update(editing.id, data);
      sit = { ...editing, ...data };
    } else {
      sit = await entities.PetSit.create(data);
    }
    await ensureLogsForSit(sit);
    setSaving(false);
    setDialogOpen(false);
    load();
    setExpandedId(sit.id);
    loadSitLogs(sit.id);
  };

  const handleDelete = async (id) => {
    await entities.PetSit.delete(id);
    load();
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
          <p className="text-xs text-muted-foreground/70 mt-1">Create one to generate sitter instructions and a daily checklist.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {sits.map(sit => {
            const sitPetIds = sit.pet_ids || [];
            const sitPets = allPets.filter(c => sitPetIds.includes(c.id));
            const days = (sit.start_date && sit.end_date)
              ? eachDayOfInterval({ start: parseISO(sit.start_date), end: parseISO(sit.end_date) })
              : [];
            const logs = sitLogs[sit.id] || [];
            const customTasks = sit.custom_tasks || [];
            const hasPmMed = sitPets.some(pet => (medicationsByPet[pet.id] || []).some(m => m.frequency === 'Twice daily'));

            return (
              <div key={sit.id} className="bg-card border border-border rounded-xl overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 cursor-pointer" onClick={() => toggleExpand(sit.id)}>
                  <div>
                    <p className="font-medium text-sm">
                      {sit.start_date && sit.end_date
                        ? `${format(parseISO(sit.start_date), 'MMM d')} – ${format(parseISO(sit.end_date), 'MMM d, yyyy')}`
                        : 'Dates not set'}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      {sit.sitter_name && <p className="text-xs text-muted-foreground">Sitter: {sit.sitter_name}</p>}
                      {sitPets.length > 0 && (
                        <p className="text-xs text-muted-foreground">
                          🐾 {sitPets.map(c => c.name).join(', ')}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={e => { e.stopPropagation(); setInviteSitId(sit.id); setInviteOpen(true); }}
                      className="text-muted-foreground hover:text-primary transition-colors"
                      title="Share with sitter"
                    >
                      <UserPlus className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={e => { e.stopPropagation(); openEdit(sit); }} className="text-muted-foreground hover:text-foreground">
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={e => { e.stopPropagation(); handleDelete(sit.id); }} className="text-muted-foreground hover:text-destructive">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                    {expandedId === sit.id ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                  </div>
                </div>

                {expandedId === sit.id && (
                  <div className="border-t border-border px-4 py-4 space-y-5">
                    {/* Instructions summary — per pet */}
                    <div className="bg-secondary/50 rounded-lg p-3 space-y-3 text-sm">
                      <p className="font-semibold text-xs uppercase tracking-wider text-muted-foreground">Sitter Instructions</p>
                      {sitPets.map(pet => {
                        const meds = medicationsByPet[pet.id] || [];
                        const foods = foodsByPet[pet.id] || [];
                        const vacs = vaccinationsByPet[pet.id] || [];
                        return (
                          <div key={pet.id} className="space-y-1.5 border-l-2 border-primary/30 pl-3">
                            <p className="font-semibold text-sm">🐾 {pet.name}</p>
                            {foods.length > 0 && (
                              <div>
                                <p className="font-medium text-xs">🍽 Food:</p>
                                <ul className="ml-3 text-muted-foreground text-xs space-y-0.5">
                                  {foods.map(f => <li key={f.id}>• {f.name}{f.brand ? ` (${f.brand})` : ''}{f.food_type ? ` — ${f.food_type}` : ''}</li>)}
                                </ul>
                              </div>
                            )}
                            {meds.length > 0 && (
                              <div>
                                <p className="font-medium text-xs">💊 Medications:</p>
                                <ul className="ml-3 text-muted-foreground text-xs space-y-0.5">
                                  {meds.map(m => <li key={m.id}>• {m.name}{m.dosage ? ` — ${m.dosage}` : ''}{m.frequency ? `, ${m.frequency}` : ''}{m.timing_instructions ? ` (${m.timing_instructions})` : ''}</li>)}
                                </ul>
                              </div>
                            )}
                            {vacs.length > 0 && (
                              <div>
                                <p className="font-medium text-xs">💉 Vaccinations on file:</p>
                                <ul className="ml-3 text-muted-foreground text-xs space-y-0.5">
                                  {vacs.map(v => <li key={v.id}>• {v.vaccine_name}{v.next_due_date ? ` · due ${v.next_due_date}` : ''}</li>)}
                                </ul>
                              </div>
                            )}
                          </div>
                        );
                      })}
                      {customTasks.length > 0 && (
                        <div>
                          <p className="font-medium text-xs">📋 Daily Tasks:</p>
                          <ul className="ml-3 text-muted-foreground text-xs space-y-0.5">{customTasks.map((t, i) => <li key={i}>• {t}</li>)}</ul>
                        </div>
                      )}
                      {sit.emergency_contact && <p className="text-xs"><span className="font-medium">🚨 Emergency:</span> <span className="text-muted-foreground">{sit.emergency_contact}</span></p>}
                      {sit.vet_contact && <p className="text-xs"><span className="font-medium">🏥 Vet:</span> <span className="text-muted-foreground">{sit.vet_contact}</span></p>}
                      {sit.additional_instructions && (
                        <div>
                          <p className="font-medium text-xs">📝 Additional Notes:</p>
                          <p className="text-muted-foreground text-xs ml-3">{sit.additional_instructions}</p>
                        </div>
                      )}
                    </div>

                    {/* Daily Checklist */}
                    {days.length > 0 && (
                      <div>
                        <p className="font-semibold text-xs uppercase tracking-wider text-muted-foreground mb-3">Daily Checklist</p>
                        <div className="space-y-3">
                          {days.map(day => {
                            const dateStr = format(day, 'yyyy-MM-dd');
                            const log = logs.find(l => l.date === dateStr);
                            if (!log) return (
                              <div key={dateStr} className="text-xs text-muted-foreground py-1">{format(day, 'EEE M/d')} — loading...</div>
                            );
                            return (
                              <div key={dateStr} className="space-y-2">
                                <p className="text-xs font-medium text-muted-foreground">{format(day, 'EEEE, MMMM d')}</p>
                                <div className="flex gap-2 flex-wrap">
                                  <CheckBtn label="AM Food" checked={!!log.am_food_given} onToggle={() => toggleBoolField(sit, log, 'am_food_given')} />
                                  <CheckBtn label="PM Food" checked={!!log.pm_food_given} onToggle={() => toggleBoolField(sit, log, 'pm_food_given')} />
                                  {sitPets.some(pet => (medicationsByPet[pet.id] || []).length > 0) && (
                                    <CheckBtn label="AM Meds" checked={!!log.am_meds_given} onToggle={() => toggleBoolField(sit, log, 'am_meds_given')} />
                                  )}
                                  {hasPmMed && <CheckBtn label="PM Meds" checked={!!log.pm_meds_given} onToggle={() => toggleBoolField(sit, log, 'pm_meds_given')} />}
                                  {customTasks.map(task => (
                                    <CheckBtn
                                      key={task}
                                      label={task}
                                      checked={(log.completed_tasks || []).includes(task)}
                                      onToggle={() => toggleTask(sit, log, task)}
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
            <DialogTitle className="font-serif text-xl">{editing ? 'Edit' : 'New'} Pet Sitting Period</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">

            {/* Pet selection */}
            {allPets.length > 1 && (
              <div className="space-y-2">
                <Label>Pets on this sit</Label>
                <div className="flex flex-wrap gap-2">
                  {allPets.map(pet => (
                    <button
                      key={pet.id}
                      type="button"
                      onClick={() => togglePetSelection(pet.id)}
                      className={`flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-full border transition-colors ${
                        selectedPetIds.includes(pet.id)
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'bg-background text-muted-foreground border-border hover:border-primary/50'
                      }`}
                    >
                      {selectedPetIds.includes(pet.id) && <Check className="h-3 w-3" />}
                      {pet.name}
                    </button>
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
                <Input type="date" value={form.start_date} onChange={e => setField('start_date', e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>End Date *</Label>
                <Input type="date" value={form.end_date} onChange={e => setField('end_date', e.target.value)} />
              </div>
            </div>
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
                    <span key={i} className="flex items-center gap-1 text-xs bg-secondary px-2.5 py-1 rounded-full">
                      {t}
                      <button onClick={() => removeTask(i)} className="text-muted-foreground hover:text-destructive ml-0.5">
                        <X className="h-3 w-3" />
                      </button>
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
    </div>
  );
}

function CheckBtn({ label, checked, onToggle }) {
  return (
    <button
      onClick={onToggle}
      className={`flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-full border transition-colors ${
        checked
          ? 'bg-primary text-primary-foreground border-primary'
          : 'bg-background text-muted-foreground border-border hover:border-primary/50'
      }`}
    >
      {checked ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
      {label}
    </button>
  );
}