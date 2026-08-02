import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { uploadFile } from '@/api/storageClient';
import { entities } from '@/api/entities';
import { track } from '@/lib/analytics';
import { computeLifeStage } from '@/lib/lifeStage';
import { Loader2, Cat as CatIcon, Dog as DogIcon } from 'lucide-react';
import { PALETTE } from '@/lib/toneColors';
import PetIdentityFields from './fields/PetIdentityFields';
import { resolveDate, isDateInfoValid } from './fields/DateInfoFields';

const emptyForm = {
  name: '', breed: '', photo_url: '', color_markings: '',
  sex: '', altered_status: '',
  birthPrecision: '', birthDate: '', birthMonthYear: '', birthYear: '',
  gotchaPrecision: '', gotchaDate: '', gotchaMonthYear: '', gotchaYear: '',
  microchip_number: '', starting_weight_lbs: '',
  akc_registered: false, akc_registered_name: '', akc_registration_number: '', breeder: '',
  notes: '',
};

// Onboarding Step 1 (spec 0029): merges the retired AddPetDialog's
// species -> form flow directly into the wizard. Nothing is saved until
// submit — there is no pet, and therefore no pet_onboarding row, until
// then, so this card manages its own local draft state rather than using
// the wizard's per-step autosave pattern.
// Spec 0036: the actual identity fields (name/breed/sex/dates/microchip/
// AKC/notes) now live in the shared PetIdentityFields, also used by the
// Edit Pet page — this card supplies the species-choice step, the
// creation-only Starting Weight field, and the create/submit handling.
export default function PetInfoCard({ onCreated }) {
  const [step, setStep] = useState('species'); // species | form
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [species, setSpecies] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const wasStarted = useRef(false);

  useEffect(() => {
    if (!wasStarted.current) { track('add_pet_started'); wasStarted.current = true; }
  }, []);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

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

  const weightValid = form.starting_weight_lbs === '' || (Number(form.starting_weight_lbs) > 0 && Number(form.starting_weight_lbs) < 500);

  const canSubmit =
    form.name.trim().length > 0 && form.name.trim().length <= 100 &&
    !!form.sex && !!form.altered_status &&
    birthValid && gotchaValid && !gotchaBeforeBirth &&
    form.microchip_number.length <= 50 &&
    form.notes.length <= 500 &&
    weightValid;

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
      color_markings: form.color_markings.trim() || null,
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

    // Optional starting weight logs into the real weight history
    // (symptom_logs.weight_grams — the only place weight is tracked, see
    // WeightCard/getWeightTrend) instead of a disconnected profile field.
    if (form.starting_weight_lbs !== '') {
      try {
        await entities.SymptomLog.create({
          pet_id: created.id,
          date: new Date().toISOString().split('T')[0],
          weight_grams: Math.round(Number(form.starting_weight_lbs) * 453.592),
        });
      } catch (err) {
        console.warn('Failed to log starting weight:', err);
      }
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
    onCreated(created.id, payload.name);
  };

  if (step === 'species') {
    return (
      <div className="flex flex-col gap-6">
        <div className="space-y-1.5 text-center">
          <p className="text-[13px] font-semibold uppercase tracking-widest text-primary/70">Pet Information</p>
          <h2 className="text-2xl font-semibold text-foreground leading-snug">What kind of pet are you adding?</h2>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <button
            type="button"
            onClick={() => chooseSpecies('Cat')}
            className="flex flex-col items-center gap-3 p-6 rounded-2xl border-2 border-border hover:border-primary hover:bg-primary/5 transition-all min-h-[44px]"
          >
            <CatIcon className="h-10 w-10 text-primary" strokeWidth={1.5} />
            <span className="font-medium">Cat</span>
          </button>
          <button
            type="button"
            onClick={() => chooseSpecies('Dog')}
            className="flex flex-col items-center gap-3 p-6 rounded-2xl border-2 border-border hover:border-primary hover:bg-primary/5 transition-all min-h-[44px]"
          >
            <DogIcon className="h-10 w-10 text-primary" strokeWidth={1.5} />
            <span className="font-medium">Dog</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <button type="button" onClick={() => setStep('species')} className="text-sm text-muted-foreground hover:text-foreground -mt-2 self-start">
        &larr; change species
      </button>

      <PetIdentityFields species={species} form={form} set={set} uploading={uploading} onPhotoChange={handlePhotoChange} showNotes={false} />

      {lifeStage && (
        <p className="text-sm text-muted-foreground -mt-2">Life stage: <span className="font-medium text-foreground">{lifeStage}</span></p>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="starting-weight">Starting Weight (lbs)</Label>
        <Input id="starting-weight" type="number" min="0" max="500" step="0.1" value={form.starting_weight_lbs} onChange={e => set('starting_weight_lbs', e.target.value)} placeholder="Optional" />
        {!weightValid && (
          <p className="text-base" style={{ color: PALETTE.red }}>Please enter a valid weight.</p>
        )}
        <p className="text-sm text-muted-foreground">Logs today's weight to {petLabelForWeightHint(species)} Trends — you can log again anytime.</p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="pet-notes">Notes</Label>
        <Textarea id="pet-notes" maxLength={500} rows={2} value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Anything important..." />
        <p className="text-sm text-muted-foreground text-right">{form.notes.length}/500</p>
      </div>

      {error && <p className="text-sm" style={{ color: PALETTE.red }} role="alert">{error}</p>}

      <Button type="submit" className="w-full min-h-[52px] text-base" disabled={saving || !canSubmit}>
        {saving ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Saving...</> : 'Continue'}
      </Button>
    </form>
  );
}

function petLabelForWeightHint(species) {
  return species === 'Dog' ? "your dog's" : "your cat's";
}
