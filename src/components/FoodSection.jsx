import { useState, useEffect } from 'react';
import { entities } from '@/api/entities';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Plus, Pencil, X, ShieldCheck, Utensils } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import SmartSelect from './SmartSelect';

const today = () => new Date().toISOString().split('T')[0];
const emptyFood = (petId) => ({ pet_id: petId, name: '', brand: '', food_type: '', prescription: false, start_date: today(), end_date: '', active: true, notes: '' });

const typeColors = {
  'Wet food': 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  'Dry food': 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  Raw: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  'Freeze-dried': 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
  Treat: 'bg-pink-100 text-pink-700 dark:bg-pink-900/40 dark:text-pink-300',
  Supplement: 'bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300',
  Other: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
};

export default function FoodSection({ petId }) {
  const [foods, setFoods] = useState([]);
  const [showDialog, setShowDialog] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyFood(petId));
  const [saving, setSaving] = useState(false);
  const [showInactive, setShowInactive] = useState(false);

  const load = async () => {
    const data = await entities.PetFood.filter({ pet_id: petId }, '-start_date');
    setFoods(data);
  };

  useEffect(() => { load(); }, [petId]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const openAdd = () => { setForm(emptyFood(petId)); setEditing(null); setShowDialog(true); };
  const openEdit = (food) => { setForm({ ...food }); setEditing(food.id); setShowDialog(true); };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    const data = { ...form };
    if (!data.end_date) delete data.end_date;
    if (editing) await entities.PetFood.update(editing, data);
    else await entities.PetFood.create(data);
    setSaving(false);
    setShowDialog(false);
    load();
  };

  const deleteFood = async (id) => {
    await entities.PetFood.delete(id);
    load();
  };

  const toggleActive = async (food) => {
    await entities.PetFood.update(food.id, { active: !food.active });
    load();
  };

  const todayStr = today();
  const active = foods.filter(f => f.active && (!f.end_date || f.end_date >= todayStr));
  const inactive = foods.filter(f => !f.active || (f.end_date && f.end_date < todayStr));

  return (
    <div className="space-y-5">
      {/* Currently feeding */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">
            Current Diet ({active.length})
          </h3>
          <Button size="sm" variant="outline" onClick={openAdd}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Add Food
          </Button>
        </div>

        {active.length === 0 ? (
          <div className="text-center py-8 border border-dashed border-border rounded-xl">
            <Utensils className="h-7 w-7 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">No foods added yet.</p>
            <button onClick={openAdd} className="text-sm text-primary mt-1 underline">Add first food</button>
          </div>
        ) : (
          <div className="space-y-2">
            {active.map(food => (
              <FoodCard key={food.id} food={food} onEdit={openEdit} onDelete={deleteFood} onToggle={toggleActive} typeColors={typeColors} />
            ))}
          </div>
        )}
      </div>

      {/* Past foods */}
      {inactive.length > 0 && (
        <div>
          <button
            onClick={() => setShowInactive(!showInactive)}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
          >
            {showInactive ? '▾' : '▸'} Past foods ({inactive.length})
          </button>
          {showInactive && (
            <div className="space-y-2 mt-2">
              {inactive.map(food => (
                <FoodCard key={food.id} food={food} onEdit={openEdit} onDelete={deleteFood} onToggle={toggleActive} typeColors={typeColors} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Add/Edit dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="sm:max-w-md overflow-y-auto max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="font-serif text-xl">{editing ? 'Edit Food' : 'Add Food'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5 col-span-2">
                <Label className="text-sm">Food Name *</Label>
                <Input value={form.name} onChange={e => set('name', e.target.value)} placeholder="e.g. Chicken Pâté" required />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">Brand</Label>
                <Input value={form.brand} onChange={e => set('brand', e.target.value)} placeholder="e.g. Royal Canin" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">Type</Label>
                <SmartSelect value={form.food_type} onValueChange={v => set('food_type', v)} placeholder="Select type" options={['Wet food', 'Dry food', 'Raw', 'Freeze-dried', 'Treat', 'Supplement', 'Other']} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">Start Date</Label>
                <Input type="date" value={form.start_date} onChange={e => set('start_date', e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">Stop Date</Label>
                <Input type="date" value={form.end_date} onChange={e => set('end_date', e.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">Notes</Label>
              <Input value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Any notes..." />
            </div>
            <div className="flex items-center justify-between p-3 bg-secondary rounded-lg">
              <div>
                <p className="text-sm font-medium">Prescription Diet</p>
                <p className="text-sm text-muted-foreground">Vet-prescribed food</p>
              </div>
              <Switch checked={form.prescription} onCheckedChange={v => set('prescription', v)} />
            </div>
            <div className="flex items-center justify-between p-3 bg-secondary rounded-lg">
              <div>
                <p className="text-sm font-medium">Currently Feeding</p>
                <p className="text-sm text-muted-foreground">Show as active in diet</p>
              </div>
              <Switch checked={form.active} onCheckedChange={v => set('active', v)} />
            </div>
            <Button type="submit" className="w-full min-h-[44px]" disabled={saving || !form.name.trim()}>
              {saving ? 'Saving...' : editing ? 'Save Changes' : 'Add to Food List'}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function FoodCard({ food, onEdit, onDelete, onToggle, typeColors }) {
  return (
    <div className={`border rounded-xl p-3.5 transition-all ${food.active ? 'bg-card border-border' : 'bg-muted/40 border-border/50 opacity-70'}`}>
      <div className="flex items-start gap-3">
        {/* Toggle */}
        <div className="pt-0.5">
          <Switch checked={food.active} onCheckedChange={() => onToggle(food)} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="font-medium text-sm leading-snug">{food.name}</p>
              {food.brand && <p className="text-sm text-muted-foreground">{food.brand}</p>}
            </div>
            <div className="flex gap-1 flex-shrink-0">
              <button onClick={() => onEdit(food)} className="text-muted-foreground hover:text-foreground transition-colors p-1">
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button onClick={() => onDelete(food.id)} className="text-muted-foreground hover:text-destructive transition-colors p-1">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
            {food.food_type && (
              <span className={`text-xs px-2 py-0.5 rounded-full ${typeColors[food.food_type] || typeColors.Other}`}>{food.food_type}</span>
            )}
            {food.prescription && (
              <span className="flex items-center gap-1 text-xs bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300 px-2 py-0.5 rounded-full">
                <ShieldCheck className="h-3 w-3" /> Rx
              </span>
            )}
          </div>
          {(food.start_date || food.end_date) && (
            <p className="text-sm text-muted-foreground mt-1">
              {food.start_date && format(parseISO(food.start_date), 'MMM d, yyyy')}
              {food.end_date && ` → ${format(parseISO(food.end_date), 'MMM d, yyyy')}`}
            </p>
          )}
          {food.notes && <p className="text-base text-muted-foreground italic mt-1">{food.notes}</p>}
        </div>
      </div>
    </div>
  );
}