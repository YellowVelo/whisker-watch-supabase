import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { uploadFile } from '@/api/storageClient';
import { entities } from '@/api/entities';
import { Loader2, Camera } from 'lucide-react';
import { getConditions, getPetEmoji, getPetLabel } from '@/lib/speciesConfig';

export default function AddPetDialog({ open, onOpenChange, onSuccess }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [species, setSpecies] = useState(null); // null = not chosen yet
  const [form, setForm] = useState({ name: '', breed: '', birth_date: '', conditions: [], medications: '', notes: '', photo_url: '' });

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const toggleCondition = (c) => {
    setForm(f => ({
      ...f,
      conditions: f.conditions.includes(c) ? f.conditions.filter(x => x !== c) : [...f.conditions, c]
    }));
  };

  const handlePhotoChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const { file_url } = await uploadFile({ file });
    set('photo_url', file_url);
    setUploading(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    setError(null);
    const data = { ...form, species };
    if (!data.birth_date) delete data.birth_date;
    try {
      await entities.Pet.create(data);
    } catch (err) {
      console.error('Failed to save pet:', err);
      setSaving(false);
      setError("Couldn't save, please try again.");
      return;
    }
    setSaving(false);
    setSpecies(null);
    setForm({ name: '', breed: '', birth_date: '', conditions: [], medications: '', notes: '', photo_url: '' });
    onSuccess?.();
    onOpenChange(false);
  };

  const handleClose = (val) => {
    if (!val) { setSpecies(null); setForm({ name: '', breed: '', birth_date: '', conditions: [], medications: '', notes: '', photo_url: '' }); setError(null); }
    onOpenChange(val);
  };

  const conditions = getConditions(species);
  const emoji = getPetEmoji(species);
  const label = getPetLabel(species);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-serif text-xl">
            {species ? `Add a ${label}` : 'Add a Pet'}
          </DialogTitle>
        </DialogHeader>

        {/* Step 1: Species picker */}
        {!species && (
          <div className="py-4">
            <p className="text-sm text-muted-foreground text-center mb-5">What kind of pet are you adding?</p>
            <div className="grid grid-cols-2 gap-4">
              <button
                type="button"
                onClick={() => setSpecies('Cat')}
                className="flex flex-col items-center gap-3 p-6 rounded-2xl border-2 border-border hover:border-primary hover:bg-primary/5 transition-all"
              >
                <span className="text-5xl">🐱</span>
                <span className="font-medium">Cat</span>
              </button>
              <button
                type="button"
                onClick={() => setSpecies('Dog')}
                className="flex flex-col items-center gap-3 p-6 rounded-2xl border-2 border-border hover:border-primary hover:bg-primary/5 transition-all"
              >
                <span className="text-5xl">🐶</span>
                <span className="font-medium">Dog</span>
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Pet details */}
        {species && (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="flex flex-col items-center gap-2">
              <div className="relative h-24 w-24 rounded-full bg-primary/10 flex items-center justify-center overflow-hidden border-2 border-dashed border-primary/30">
                {form.photo_url ? (
                  <img src={form.photo_url} alt={label} className="h-full w-full object-cover" />
                ) : uploading ? (
                  <Loader2 className="h-7 w-7 text-primary animate-spin" />
                ) : (
                  <span className="text-4xl">{emoji}</span>
                )}
              </div>
              <label className="cursor-pointer flex items-center gap-1.5 text-sm text-primary hover:text-primary/80 transition-colors">
                <Camera className="h-4 w-4" />
                {form.photo_url ? 'Change photo' : 'Add photo'}
                <input type="file" accept="image/*" className="hidden" onChange={handlePhotoChange} disabled={uploading} />
              </label>
            </div>
            <div className="space-y-1.5">
              <Label>Name *</Label>
              <Input value={form.name} onChange={e => set('name', e.target.value)} placeholder={`e.g. ${species === 'Dog' ? 'Buddy' : 'Luna'}`} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Breed</Label>
                <Input value={form.breed} onChange={e => set('breed', e.target.value)} placeholder={species === 'Dog' ? 'e.g. Labrador' : 'e.g. Siamese'} />
              </div>
              <div className="space-y-1.5">
                <Label>Birth Date</Label>
                <Input type="date" value={form.birth_date} onChange={e => set('birth_date', e.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Conditions</Label>
              <div className="flex flex-wrap gap-3">
                {conditions.map(c => (
                  <label key={c} className="flex items-center gap-1.5 text-sm cursor-pointer">
                    <Checkbox checked={form.conditions.includes(c)} onCheckedChange={() => toggleCondition(c)} />
                    {c}
                  </label>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Textarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={2} placeholder="Anything important..." />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex gap-3">
              <Button type="button" variant="outline" className="flex-1" onClick={() => { setSpecies(null); setForm({ name: '', breed: '', birth_date: '', conditions: [], medications: '', notes: '', photo_url: '' }); }}>
                Back
              </Button>
              <Button type="submit" className="flex-1" disabled={saving || !form.name.trim()}>
                {saving ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Saving...</> : `Add ${label}`}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}