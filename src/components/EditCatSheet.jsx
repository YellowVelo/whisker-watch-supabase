import { useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { base44 } from '@/api/base44Client';
import { Loader2, X, Plus } from 'lucide-react';
import { getConditions } from '@/lib/speciesConfig';

export default function EditCatSheet({ cat, open, onOpenChange, onSuccess }) {
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [form, setForm] = useState({
    name: cat?.name || '',
    breed: cat?.breed || '',
    birth_date: cat?.birth_date || '',
    photo_url: cat?.photo_url || '',
    conditions: cat?.conditions || [],
    nicknames: cat?.nicknames || [],
    favorite_activities: cat?.favorite_activities || [],
    medications: cat?.medications || '',
    notes: cat?.notes || '',
  });
  const [newNickname, setNewNickname] = useState('');
  const [newActivity, setNewActivity] = useState('');

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handlePhoto = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const { file_url } = await base44.integrations.Core.UploadFile({ file });
    set('photo_url', file_url);
    setUploading(false);
  };

  const toggleCondition = (c) => {
    set('conditions', form.conditions.includes(c)
      ? form.conditions.filter(x => x !== c)
      : [...form.conditions, c]);
  };

  const addNickname = () => {
    const n = newNickname.trim();
    if (n && !form.nicknames.includes(n)) set('nicknames', [...form.nicknames, n]);
    setNewNickname('');
  };

  const addActivity = () => {
    const a = newActivity.trim();
    if (a && !form.favorite_activities.includes(a)) set('favorite_activities', [...form.favorite_activities, a]);
    setNewActivity('');
  };

  const handleSave = async () => {
    setSaving(true);
    await base44.entities.Cat.update(cat.id, form);
    setSaving(false);
    onSuccess?.();
    onOpenChange(false);
  };

  const conditions = getConditions(cat?.species);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="font-serif text-xl">Edit Profile</SheetTitle>
        </SheetHeader>
        <div className="mt-5 space-y-5">

          {/* Photo */}
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Photo</Label>
            {form.photo_url && (
              <img src={form.photo_url} alt="preview" className="h-24 w-24 rounded-xl object-cover mb-2" />
            )}
            <label className="inline-flex items-center gap-2 text-sm text-primary cursor-pointer min-h-[36px]">
              {uploading ? <><Loader2 className="h-4 w-4 animate-spin" /> Uploading...</> : '📷 Change photo'}
              <input type="file" accept="image/*" className="hidden" onChange={handlePhoto} />
            </label>
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Name *</Label>
            <Input value={form.name} onChange={e => set('name', e.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Breed</Label>
              <Input value={form.breed} onChange={e => set('breed', e.target.value)} placeholder="e.g. Tabby" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Birth Date</Label>
              <Input type="date" value={form.birth_date} onChange={e => set('birth_date', e.target.value)} />
            </div>
          </div>

          {/* Conditions */}
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Conditions</Label>
            <div className="flex flex-wrap gap-2">
              {conditions.map(c => {
                const active = form.conditions.includes(c);
                return (
                  <button key={c} type="button" onClick={() => toggleCondition(c)}
                    className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                      active ? 'bg-primary text-primary-foreground border-primary' : 'bg-background text-foreground border-border hover:border-primary/50'
                    }`}>
                    {c}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Nicknames */}
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Nicknames</Label>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {form.nicknames.map(n => (
                <span key={n} className="inline-flex items-center gap-1 text-xs bg-accent/20 text-accent-foreground px-2.5 py-1 rounded-full">
                  {n}
                  <button type="button" onClick={() => set('nicknames', form.nicknames.filter(x => x !== n))}>
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <Input value={newNickname} onChange={e => setNewNickname(e.target.value)}
                placeholder="Add a nickname…" className="text-sm"
                onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addNickname())} />
              <Button type="button" size="sm" variant="outline" onClick={addNickname}>
                <Plus className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

          {/* Favorite Activities */}
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Favorite Activities</Label>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {form.favorite_activities.map(a => (
                <span key={a} className="inline-flex items-center gap-1 text-xs bg-primary/10 text-primary px-2.5 py-1 rounded-full">
                  {a}
                  <button type="button" onClick={() => set('favorite_activities', form.favorite_activities.filter(x => x !== a))}>
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <Input value={newActivity} onChange={e => setNewActivity(e.target.value)}
                placeholder="e.g. Chasing laser pointers…" className="text-sm"
                onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addActivity())} />
              <Button type="button" size="sm" variant="outline" onClick={addActivity}>
                <Plus className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Notes</Label>
            <Textarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={3} placeholder="Personality, quirks, care notes…" />
          </div>

          <Button className="w-full" onClick={handleSave} disabled={saving || !form.name.trim()}>
            {saving ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Saving…</> : 'Save Changes'}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}