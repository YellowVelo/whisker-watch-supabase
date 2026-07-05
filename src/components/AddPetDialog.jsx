import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { uploadFile } from '@/api/storageClient';
import { entities } from '@/api/entities';
import { track } from '@/lib/analytics';
import { computeLifeStage } from '@/lib/lifeStage';
import { getOrCreatePetOnboarding } from '@/lib/onboardingClient';
import { Loader2, Camera } from 'lucide-react';
import { getPetEmoji, getPetLabel } from '@/lib/speciesConfig';

const PRECISION_OPTIONS = [
  { value: 'EXACT', label: 'Exact date' },
  { value: 'MONTH_YEAR', label: 'Month & year' },
  { value: 'YEAR', label: 'Year only' },
  { value: 'UNKNOWN', label: "I don't know" },
];

const emptyForm = {
  name: '', breed: '', photo_url: '',
  sex: '', altered_status: '',
  birthPrecision: '', birthDate: '', birthMonthYear: '', birthYear: '',
  gotchaPrecision: '', gotchaDate: '', gotchaMonthYear: '', gotchaYear: '',
  microchip_number: '',
  akc_registered: false, akc_registered_name: '', akc_registration_number: '', breeder: '',
  notes: '',
};

function resolveDate(precision, { exact, monthYear, year }) {
  if (precision === 'EXACT') return exact || null;
  if (precision === 'MONTH_YEAR') return monthYear ? `${monthYear}-01` : null;
  if (precision === 'YEAR') return year ? `${year}-01-01` : null;
  return null;
}

function isDateInfoValid(precision, parts) {
  if (!precision) return false;
  if (precision === 'UNKNOWN') return true;
  if (precision === 'EXACT') {
    if (!parts.exact) return false;
    return new Date(parts.exact) <= new Date();
  }
  if (precision === 'MONTH_YEAR') {
    if (!parts.monthYear) return false;
    return parts.monthYear <= new Date().toISOString().slice(0, 7);
  }
  if (precision === 'YEAR') {
    if (!parts.year) return false;
    return Number(parts.year) <= new Date().getFullYear();
  }
  return false;
}

function DateInfoFields({ precision, parts, onPrecisionChange, onPartsChange, idPrefix }) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {PRECISION_OPTIONS.map(opt => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onPrecisionChange(opt.value)}
            className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
              precision === opt.value ? 'bg-primary text-primary-foreground border-primary' : 'bg-background text-foreground border-border hover:border-primary/50'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
      {precision === 'EXACT' && (
        <Input
          type="date"
          id={`${idPrefix}-exact`}
          aria-label="Exact date"
          value={parts.exact}
          max={new Date().toISOString().slice(0, 10)}
          onChange={e => onPartsChange({ ...parts, exact: e.target.value })}
        />
      )}
      {precision === 'MONTH_YEAR' && (
        <Input
          type="month"
          id={`${idPrefix}-month-year`}
          aria-label="Month and year"
          value={parts.monthYear}
          max={new Date().toISOString().slice(0, 7)}
          onChange={e => onPartsChange({ ...parts, monthYear: e.target.value })}
        />
      )}
      {precision === 'YEAR' && (
        <Input
          type="number"
          id={`${idPrefix}-year`}
          aria-label="Year"
          inputMode="numeric"
          placeholder={`e.g. ${new Date().getFullYear() - 3}`}
          value={parts.year}
          max={new Date().getFullYear()}
          onChange={e => onPartsChange({ ...parts, year: e.target.value })}
        />
      )}
    </div>
  );
}

export default function AddPetDialog({ open, onOpenChange, onSuccess, returnTo = '/' }) {
  const navigate = useNavigate();
  const [step, setStep] = useState('species'); // species | form | success
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [species, setSpecies] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [createdPetName, setCreatedPetName] = useState('');
  const [createdPetId, setCreatedPetId] = useState(null);
  const wasOpen = useRef(false);

  useEffect(() => {
    if (open && !wasOpen.current) track('add_pet_started');
    wasOpen.current = open;
  }, [open]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const reset = () => {
    setSpecies(null);
    setForm(emptyForm);
    setError(null);
    setStep('species');
    setCreatedPetName('');
    setCreatedPetId(null);
  };

  const handlePhotoChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const { file_url } = await uploadFile({ file });
    set('photo_url', file_url);
    setUploading(false);
    track('photo_added', { species });
  };

  const chooseSpecies = (s) => {
    setSpecies(s);
    setStep('form');
    track('species_selected', { species: s });
  };

  const birthParts = { exact: form.birthDate, monthYear: form.birthMonthYear, year: form.birthYear };
  const gotchaParts = { exact: form.gotchaDate, monthYear: form.gotchaMonthYear, year: form.gotchaYear };

  const resolvedBirthDate = resolveDate(form.birthPrecision, birthParts);
  const resolvedGotchaDate = form.gotchaPrecision ? resolveDate(form.gotchaPrecision, gotchaParts) : null;

  const birthValid = isDateInfoValid(form.birthPrecision, birthParts);
  const gotchaValid = !form.gotchaPrecision || isDateInfoValid(form.gotchaPrecision, gotchaParts);
  const gotchaBeforeBirth = form.birthPrecision === 'EXACT' && form.gotchaPrecision === 'EXACT'
    && resolvedBirthDate && resolvedGotchaDate && new Date(resolvedGotchaDate) < new Date(resolvedBirthDate);

  const lifeStage = computeLifeStage(species, resolvedBirthDate, form.birthPrecision);

  const canSubmit =
    form.name.trim().length > 0 && form.name.trim().length <= 100 &&
    !!form.sex && !!form.altered_status &&
    birthValid && gotchaValid && !gotchaBeforeBirth &&
    form.microchip_number.length <= 50 &&
    form.notes.length <= 500;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSaving(true);
    setError(null);

    const isDog = species === 'Dog';
    const payload = {
      species,
      name: form.name.trim(),
      breed: form.breed.trim() || null,
      photo_url: form.photo_url || null,
      sex: form.sex,
      altered_status: form.altered_status,
      birth_date: resolvedBirthDate,
      birth_date_precision: form.birthPrecision,
      gotcha_date: form.gotchaPrecision ? resolvedGotchaDate : null,
      gotcha_date_precision: form.gotchaPrecision || null,
      microchip_number: form.microchip_number.trim() || null,
      akc_registered: isDog ? form.akc_registered : false,
      akc_registered_name: isDog && form.akc_registered ? (form.akc_registered_name.trim() || null) : null,
      akc_registration_number: isDog && form.akc_registered ? (form.akc_registration_number.trim() || null) : null,
      breeder: isDog && form.akc_registered ? (form.breeder.trim() || null) : null,
      notes: form.notes.trim() || null,
    };

    let created;
    try {
      created = await entities.Pet.create(payload);
    } catch (err) {
      console.error('Failed to save pet:', err);
      setSaving(false);
      setError('Unable to create pet. Please try again.');
      return;
    }

    track('pet_created', {
      pet_id: created.id,
      species,
      birth_date_precision: form.birthPrecision,
      has_photo: !!form.photo_url,
      has_gotcha_day: !!form.gotchaPrecision,
      has_microchip: !!form.microchip_number,
      akc_registered: payload.akc_registered,
    });

    setSaving(false);
    setCreatedPetName(payload.name);
    setCreatedPetId(created.id);
    setStep('success');
    onSuccess?.();
  };

  const handleCancel = () => {
    if (step !== 'success') track('add_pet_cancelled', { step });
    reset();
    onOpenChange(false);
  };

  const handleClose = (val) => {
    if (!val) handleCancel();
    else onOpenChange(val);
  };

  const handleDone = () => {
    reset();
    onOpenChange(false);
    navigate(returnTo);
  };

  const handleContinueSetup = () => {
    track('continue_to_onboarding', { pet_id: createdPetId });
    const petId = createdPetId;
    reset();
    onOpenChange(false);
    navigate(`/pet/${petId}/onboarding`);
  };

  const handleSkipOnboarding = async () => {
    track('add_pet_onboarding_skipped', { pet_id: createdPetId });
    // Best-effort: record that this was an explicit skip (vs. an
    // interrupted flow) so it stays distinguishable later. A failure
    // here shouldn't trap the owner on this dialog — skip is meant to
    // be a low-friction escape hatch.
    try {
      const { row } = await getOrCreatePetOnboarding(createdPetId);
      await entities.PetOnboarding.update(row.id, { skipped_at: new Date().toISOString() });
    } catch (err) {
      console.warn('Failed to record onboarding skip:', err);
    }
    handleDone();
  };

  const emoji = getPetEmoji(species);
  const label = getPetLabel(species);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        {step !== 'success' && (
          <DialogHeader>
            <DialogTitle className="font-serif text-xl">
              {species ? `Add a ${label}` : 'Add a Pet'}
            </DialogTitle>
          </DialogHeader>
        )}

        {step === 'species' && (
          <div className="py-4">
            <p className="text-sm text-muted-foreground text-center mb-5">What kind of pet are you adding?</p>
            <div className="grid grid-cols-2 gap-4">
              <button
                type="button"
                onClick={() => chooseSpecies('Cat')}
                className="flex flex-col items-center gap-3 p-6 rounded-2xl border-2 border-border hover:border-primary hover:bg-primary/5 transition-all"
              >
                <span className="text-5xl">🐱</span>
                <span className="font-medium">Cat</span>
              </button>
              <button
                type="button"
                onClick={() => chooseSpecies('Dog')}
                className="flex flex-col items-center gap-3 p-6 rounded-2xl border-2 border-border hover:border-primary hover:bg-primary/5 transition-all"
              >
                <span className="text-5xl">🐶</span>
                <span className="font-medium">Dog</span>
              </button>
            </div>
          </div>
        )}

        {step === 'form' && (
          <form onSubmit={handleSubmit} className="space-y-4">
            <button type="button" onClick={() => setStep('species')} className="text-xs text-muted-foreground hover:text-foreground -mt-2">
              &larr; change species
            </button>

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
              <label className="cursor-pointer flex items-center gap-1.5 text-sm text-primary hover:text-primary/80 transition-colors min-h-[44px]">
                <Camera className="h-4 w-4" />
                {form.photo_url ? 'Change photo' : 'Add photo'}
                <input type="file" accept="image/*" className="hidden" onChange={handlePhotoChange} disabled={uploading} />
              </label>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="pet-name">Name *</Label>
              <Input id="pet-name" required maxLength={100} value={form.name} onChange={e => set('name', e.target.value)} placeholder={`e.g. ${species === 'Dog' ? 'Buddy' : 'Luna'}`} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="pet-breed">Breed</Label>
              <Input id="pet-breed" value={form.breed} onChange={e => set('breed', e.target.value)} placeholder={species === 'Dog' ? 'e.g. Labrador' : 'e.g. Siamese'} />
            </div>

            <div className="space-y-1.5">
              <Label id="sex-label">Sex *</Label>
              <RadioGroup aria-labelledby="sex-label" value={form.sex} onValueChange={v => set('sex', v)} className="grid-flow-col auto-cols-max gap-4">
                {['Female', 'Male', 'Unknown'].map(v => (
                  <label key={v} className="flex items-center gap-1.5 text-sm cursor-pointer min-h-[44px]">
                    <RadioGroupItem value={v} id={`sex-${v}`} />
                    {v}
                  </label>
                ))}
              </RadioGroup>
            </div>

            <div className="space-y-1.5">
              <Label id="altered-label">Spayed / Neutered *</Label>
              <RadioGroup aria-labelledby="altered-label" value={form.altered_status} onValueChange={v => set('altered_status', v)} className="grid-flow-col auto-cols-max gap-4">
                {['Yes', 'No', 'Unknown'].map(v => (
                  <label key={v} className="flex items-center gap-1.5 text-sm cursor-pointer min-h-[44px]">
                    <RadioGroupItem value={v} id={`altered-${v}`} />
                    {v}
                  </label>
                ))}
              </RadioGroup>
            </div>

            <div className="space-y-1.5">
              <Label>Birth Date *</Label>
              <DateInfoFields
                idPrefix="birth"
                precision={form.birthPrecision}
                parts={birthParts}
                onPrecisionChange={v => { set('birthPrecision', v); track('birth_date_precision_selected', { field: 'birth_date', precision: v }); }}
                onPartsChange={p => setForm(f => ({ ...f, birthDate: p.exact, birthMonthYear: p.monthYear, birthYear: p.year }))}
              />
              {form.birthPrecision && !birthValid && (
                <p className="text-xs text-red-600">Please enter a valid, non-future date.</p>
              )}
              {lifeStage && (
                <p className="text-xs text-muted-foreground">Life stage: <span className="font-medium text-foreground">{lifeStage}</span></p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label>Gotcha Day</Label>
              <DateInfoFields
                idPrefix="gotcha"
                precision={form.gotchaPrecision}
                parts={gotchaParts}
                onPrecisionChange={v => { set('gotchaPrecision', v === form.gotchaPrecision ? '' : v); track('birth_date_precision_selected', { field: 'gotcha_date', precision: v }); }}
                onPartsChange={p => setForm(f => ({ ...f, gotchaDate: p.exact, gotchaMonthYear: p.monthYear, gotchaYear: p.year }))}
              />
              {gotchaBeforeBirth && (
                <p className="text-xs text-red-600">Gotcha day can't be before the birth date.</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="microchip">Microchip Number</Label>
              <Input id="microchip" maxLength={50} value={form.microchip_number} onChange={e => set('microchip_number', e.target.value)} placeholder="Optional" />
            </div>

            {species === 'Dog' && (
              <div className="space-y-3 rounded-xl border border-border p-3">
                <div className="space-y-1.5">
                  <Label id="akc-label">Registered with AKC?</Label>
                  <RadioGroup
                    aria-labelledby="akc-label"
                    value={form.akc_registered ? 'Yes' : 'No'}
                    onValueChange={v => {
                      const registered = v === 'Yes';
                      set('akc_registered', registered);
                      if (registered) track('akc_toggle_enabled');
                      if (!registered) setForm(f => ({ ...f, akc_registered: false, akc_registered_name: '', akc_registration_number: '', breeder: '' }));
                    }}
                    className="grid-flow-col auto-cols-max gap-4"
                  >
                    {['Yes', 'No'].map(v => (
                      <label key={v} className="flex items-center gap-1.5 text-sm cursor-pointer min-h-[44px]">
                        <RadioGroupItem value={v} id={`akc-${v}`} />
                        {v}
                      </label>
                    ))}
                  </RadioGroup>
                </div>
                {form.akc_registered && (
                  <>
                    <div className="space-y-1.5">
                      <Label htmlFor="akc-registered-name">Registered Name</Label>
                      <Input id="akc-registered-name" value={form.akc_registered_name} onChange={e => set('akc_registered_name', e.target.value)} placeholder="Optional" />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="akc-registration-number">AKC Registration Number</Label>
                      <Input id="akc-registration-number" value={form.akc_registration_number} onChange={e => set('akc_registration_number', e.target.value)} placeholder="Optional" />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="breeder">Breeder</Label>
                      <Input id="breeder" value={form.breeder} onChange={e => set('breeder', e.target.value)} placeholder="Optional" />
                    </div>
                  </>
                )}
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="pet-notes">Notes</Label>
              <Textarea id="pet-notes" maxLength={500} rows={2} value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Anything important..." />
              <p className="text-xs text-muted-foreground text-right">{form.notes.length}/500</p>
            </div>

            {error && <p className="text-sm text-red-600" role="alert">{error}</p>}

            <div className="flex gap-3">
              <Button type="button" variant="outline" className="flex-1" onClick={handleCancel}>
                Cancel
              </Button>
              <Button type="submit" className="flex-1" disabled={saving || !canSubmit}>
                {saving ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Saving...</> : 'Create Pet'}
              </Button>
            </div>
          </form>
        )}

        {step === 'success' && (
          <div className="py-6 flex flex-col items-center gap-3 text-center">
            <span className="text-5xl">🐾</span>
            <p className="font-serif text-xl">{createdPetName} has been added!</p>
            <p className="text-sm text-muted-foreground max-w-xs">
              Let's spend a few minutes teaching Wysker Watch about {createdPetName}. This helps us recognize meaningful changes over time.
            </p>
            <p className="text-xs text-muted-foreground">About 3 minutes.</p>
            <div className="flex flex-col gap-3 w-full mt-2">
              <Button className="w-full" onClick={handleContinueSetup}>
                Complete {createdPetName}'s Profile
              </Button>
              <Button variant="outline" className="w-full" onClick={handleSkipOnboarding}>
                Skip for now
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
