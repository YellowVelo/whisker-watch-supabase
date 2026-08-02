import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { uploadFile } from '@/api/storageClient';
import { entities } from '@/api/entities';
import { track } from '@/lib/analytics';
import { computeLifeStage } from '@/lib/lifeStage';
import { Loader2, Camera, Cat as CatIcon, Dog as DogIcon } from 'lucide-react';
import { getPetLabel } from '@/lib/speciesConfig';
import { getBreeds } from '@/lib/breedConfig';
import { PALETTE } from '@/lib/toneColors';
import PillToggle from '@/components/PillToggle';

const PRECISION_OPTIONS = [
  { value: 'EXACT', label: 'Exact date' },
  { value: 'MONTH_YEAR', label: 'Month & year' },
  { value: 'YEAR', label: 'Year only' },
  { value: 'UNKNOWN', label: "I don't know" },
];

const emptyForm = {
  name: '', breed: '', photo_url: '', color_markings: '',
  sex: '', altered_status: '',
  birthPrecision: '', birthDate: '', birthMonthYear: '', birthYear: '',
  gotchaPrecision: '', gotchaDate: '', gotchaMonthYear: '', gotchaYear: '',
  microchip_number: '', starting_weight_lbs: '',
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
          <PillToggle
            key={opt.value}
            active={precision === opt.value}
            onClick={() => onPrecisionChange(opt.value)}
            className="text-[13px] px-3 py-1.5"
          >
            {opt.label}
          </PillToggle>
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

// Onboarding Step 1 (spec 0029): merges the retired AddPetDialog's
// species -> form flow directly into the wizard. Nothing is saved until
// submit — there is no pet, and therefore no pet_onboarding row, until
// then, so this card manages its own local draft state rather than using
// the wizard's per-step autosave pattern.
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

  const SpeciesIcon = species === 'Dog' ? DogIcon : CatIcon;
  const label = getPetLabel(species);
  const breeds = species ? getBreeds(species) : [];

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

      <div className="flex flex-col items-center gap-2">
        <div className="relative h-24 w-24 rounded-full bg-primary/10 flex items-center justify-center overflow-hidden border-2 border-dashed border-primary/30">
          {form.photo_url ? (
            <img src={form.photo_url} alt={label} className="h-full w-full object-cover" />
          ) : uploading ? (
            <Loader2 className="h-7 w-7 text-primary animate-spin" />
          ) : (
            <SpeciesIcon className="h-8 w-8 text-primary" strokeWidth={1.5} />
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
        <Input
          id="pet-breed"
          list="pet-breed-suggestions"
          value={form.breed}
          onChange={e => set('breed', e.target.value)}
          placeholder={species === 'Dog' ? 'e.g. Labrador, or Mixed' : 'e.g. Siamese, or Mixed'}
        />
        <datalist id="pet-breed-suggestions">
          {breeds.map((b) => <option key={b} value={b} />)}
        </datalist>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="pet-markings">Color / Markings</Label>
        <Input id="pet-markings" maxLength={200} value={form.color_markings} onChange={e => set('color_markings', e.target.value)} placeholder="Optional" />
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
          <p className="text-base" style={{ color: PALETTE.red }}>Please enter a valid, non-future date.</p>
        )}
        {lifeStage && (
          <p className="text-sm text-muted-foreground">Life stage: <span className="font-medium text-foreground">{lifeStage}</span></p>
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
          <p className="text-base" style={{ color: PALETTE.red }}>Gotcha day can't be before the birth date.</p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="microchip">Microchip Number</Label>
        <Input id="microchip" maxLength={50} value={form.microchip_number} onChange={e => set('microchip_number', e.target.value)} placeholder="Optional" />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="starting-weight">Starting Weight (lbs)</Label>
        <Input id="starting-weight" type="number" min="0" max="500" step="0.1" value={form.starting_weight_lbs} onChange={e => set('starting_weight_lbs', e.target.value)} placeholder="Optional" />
        {!weightValid && (
          <p className="text-base" style={{ color: PALETTE.red }}>Please enter a valid weight.</p>
        )}
        <p className="text-sm text-muted-foreground">Logs today's weight to {petLabelForWeightHint(species)} Trends — you can log again anytime.</p>
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
