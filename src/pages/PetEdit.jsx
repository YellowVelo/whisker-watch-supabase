import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2, X, Plus, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { entities } from '@/api/entities';
import { uploadFile } from '@/api/storageClient';
import IconButton from '@/components/IconButton';
import PageTransition from '@/components/PageTransition';
import PetIdentityFields from '@/components/onboarding/fields/PetIdentityFields';
import { resolveDate, decomposeDateParts } from '@/components/onboarding/fields/DateInfoFields';
import InviteCoOwnerDialog from '@/components/InviteCoOwnerDialog';

// Spec 0036: the pet-identity half of the old EditPetSheet split out onto
// its own routed page (Conditions moved to PetConditions.jsx instead).
// Reuses the same PetIdentityFields onboarding's PetInfoCard uses, so this
// is the first time fields set once at pet creation (sex, altered status,
// color/markings, gotcha day, microchip, AKC registration) become editable
// again afterward — see spec 0036's "Before You Approve This" section.
function formFromPet(pet) {
  const birthParts = decomposeDateParts(pet.birth_date, pet.birth_date_precision);
  const gotchaParts = decomposeDateParts(pet.gotcha_date, pet.gotcha_date_precision);
  return {
    name: pet.name || '',
    breed: pet.breed || '',
    photo_url: pet.photo_url || '',
    color_markings: pet.color_markings || '',
    sex: pet.sex || '',
    altered_status: pet.altered_status || '',
    birthPrecision: pet.birth_date_precision || '',
    birthDate: birthParts.exact,
    birthMonthYear: birthParts.monthYear,
    birthYear: birthParts.year,
    gotchaPrecision: pet.gotcha_date_precision || '',
    gotchaDate: gotchaParts.exact,
    gotchaMonthYear: gotchaParts.monthYear,
    gotchaYear: gotchaParts.year,
    microchip_number: pet.microchip_number || '',
    akc_registered: pet.akc_registered || false,
    akc_registered_name: pet.akc_registered_name || '',
    akc_registration_number: pet.akc_registration_number || '',
    breeder: pet.breeder || '',
    notes: pet.notes || '',
    nicknames: pet.nicknames || [],
    favorite_activities: pet.favorite_activities || [],
  };
}

export default function PetEdit() {
  const { petId } = useParams();
  const navigate = useNavigate();
  const [pet, setPet] = useState(null);
  const [form, setForm] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
  const [newNickname, setNewNickname] = useState('');
  const [newActivity, setNewActivity] = useState('');
  const [coOwnerOpen, setCoOwnerOpen] = useState(false);

  useEffect(() => {
    entities.Pet.get(petId)
      .then((p) => { setPet(p); setForm(formFromPet(p)); })
      .catch(() => setError("We couldn't load this pet."))
      .finally(() => setLoading(false));
  }, [petId]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handlePhotoChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const { file_url } = await uploadFile({ file });
    set('photo_url', file_url);
    setUploading(false);
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
    if (!form.name.trim()) return;
    setSaving(true);
    setError(null);

    const isDog = pet.species === 'Dog';
    const birthParts = { exact: form.birthDate, monthYear: form.birthMonthYear, year: form.birthYear };
    const gotchaParts = { exact: form.gotchaDate, monthYear: form.gotchaMonthYear, year: form.gotchaYear };

    const payload = {
      name: form.name.trim(),
      breed: form.breed.trim() || null,
      photo_url: form.photo_url || null,
      color_markings: form.color_markings.trim() || null,
      sex: form.sex || null,
      altered_status: form.altered_status || null,
      birth_date: form.birthPrecision ? resolveDate(form.birthPrecision, birthParts) : null,
      birth_date_precision: form.birthPrecision || 'UNKNOWN',
      gotcha_date: form.gotchaPrecision ? resolveDate(form.gotchaPrecision, gotchaParts) : null,
      gotcha_date_precision: form.gotchaPrecision || null,
      microchip_number: form.microchip_number.trim() || null,
      akc_registered: isDog ? form.akc_registered : false,
      akc_registered_name: isDog && form.akc_registered ? (form.akc_registered_name.trim() || null) : null,
      akc_registration_number: isDog && form.akc_registered ? (form.akc_registration_number.trim() || null) : null,
      breeder: isDog && form.akc_registered ? (form.breeder.trim() || null) : null,
      notes: form.notes.trim() || null,
      nicknames: form.nicknames,
      favorite_activities: form.favorite_activities,
    };

    try {
      await entities.Pet.update(pet.id, payload);
      navigate('/pets');
    } catch (err) {
      console.error('Failed to save pet:', err);
      setError('Unable to save changes. Please try again.');
      setSaving(false);
    }
  };

  return (
    <PageTransition>
      <div className="min-h-screen bg-background pb-28">
        <div
          className="sticky z-20 bg-background/80 backdrop-blur-xl border-b border-white/8 px-4 py-3 flex items-center gap-3"
          style={{ top: 'var(--account-banner-height, 0px)', paddingTop: 'calc(env(safe-area-inset-top) + 12px)' }}
        >
          <IconButton icon={ArrowLeft} onClick={() => navigate(-1)} aria-label="Back" />
          <h1 className="text-[28px] font-semibold text-white flex-1">Edit Pet</h1>
        </div>

        <div className="max-w-2xl mx-auto px-4 py-5">
          {loading || !pet || !form ? (
            <div className="flex justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <PetIdentityFields
                species={pet.species}
                form={form}
                set={set}
                uploading={uploading}
                onPhotoChange={handlePhotoChange}
                showNotes={false}
              />

              <div className="space-y-1.5">
                <Label>Nicknames</Label>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {form.nicknames.map(n => (
                    <span key={n} className="inline-flex items-center gap-1 text-[13px] bg-accent/20 text-accent-foreground px-2.5 py-1 rounded-full">
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

              <div className="space-y-1.5">
                <Label>Favorite Activities</Label>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {form.favorite_activities.map(a => (
                    <span key={a} className="inline-flex items-center gap-1 text-[13px] bg-primary/10 text-primary px-2.5 py-1 rounded-full">
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
                <Label htmlFor="pet-notes">Notes</Label>
                <Textarea id="pet-notes" value={form.notes} onChange={e => set('notes', e.target.value)} rows={3} placeholder="Personality, quirks, care notes…" />
              </div>

              <Button type="button" variant="outline" className="w-full" onClick={() => setCoOwnerOpen(true)}>
                <UserPlus className="h-4 w-4 mr-2" /> Invite Co-Owner
              </Button>

              {error && <p className="text-sm text-destructive" role="alert">{error}</p>}

              <Button className="w-full" onClick={handleSave} disabled={saving || !form.name.trim()}>
                {saving ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Saving…</> : 'Save Changes'}
              </Button>
            </div>
          )}
        </div>
      </div>

      {pet?.id && (
        <InviteCoOwnerDialog petId={pet.id} petName={pet.name} open={coOwnerOpen} onOpenChange={setCoOwnerOpen} />
      )}
    </PageTransition>
  );
}
