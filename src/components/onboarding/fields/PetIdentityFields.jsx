import { Loader2, Camera } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { getPetLabel } from '@/lib/speciesConfig';
import { getBreeds } from '@/lib/breedConfig';
import { PALETTE } from '@/lib/toneColors';
import DateInfoFields, { isDateInfoValid } from './DateInfoFields';

// The pet-identity form fields shared by onboarding's PetInfoCard (creating
// a pet, species chosen just beforehand) and the Edit Pet page (editing an
// existing pet, species fixed and not shown here). `species` is a fixed
// prop in both cases — this component never lets it change. `form`/`set`
// use the same raw, precision-aware shape PetInfoCard already worked with
// (birthPrecision/birthDate/birthMonthYear/birthYear, etc.) so both callers
// resolve dates via DateInfoFields' resolveDate() the same way.
export default function PetIdentityFields({ species, form, set, uploading, onPhotoChange, showNotes = true }) {
  const label = getPetLabel(species);
  const breeds = getBreeds(species);

  const birthParts = { exact: form.birthDate, monthYear: form.birthMonthYear, year: form.birthYear };
  const gotchaParts = { exact: form.gotchaDate, monthYear: form.gotchaMonthYear, year: form.gotchaYear };
  const birthValid = isDateInfoValid(form.birthPrecision, birthParts);
  const gotchaValid = !form.gotchaPrecision || isDateInfoValid(form.gotchaPrecision, gotchaParts);

  return (
    <>
      <div className="flex flex-col items-center gap-2">
        <div className="relative h-24 w-24 rounded-full bg-primary/10 flex items-center justify-center overflow-hidden border-2 border-dashed border-primary/30">
          {form.photo_url ? (
            <img src={form.photo_url} alt={label} className="h-full w-full object-cover" />
          ) : uploading ? (
            <Loader2 className="h-7 w-7 text-primary animate-spin" />
          ) : (
            <Camera className="h-8 w-8 text-primary" strokeWidth={1.5} />
          )}
        </div>
        <label className="cursor-pointer flex items-center gap-1.5 text-sm text-primary hover:text-primary/80 transition-colors min-h-[44px]">
          <Camera className="h-4 w-4" />
          {form.photo_url ? 'Change photo' : 'Add photo'}
          <input type="file" accept="image/*" className="hidden" onChange={onPhotoChange} disabled={uploading} />
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
          onPrecisionChange={v => set('birthPrecision', v)}
          onPartsChange={p => { set('birthDate', p.exact); set('birthMonthYear', p.monthYear); set('birthYear', p.year); }}
        />
        {form.birthPrecision && !birthValid && (
          <p className="text-base" style={{ color: PALETTE.red }}>Please enter a valid, non-future date.</p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label>Gotcha Day</Label>
        <DateInfoFields
          idPrefix="gotcha"
          precision={form.gotchaPrecision}
          parts={gotchaParts}
          onPrecisionChange={v => set('gotchaPrecision', v === form.gotchaPrecision ? '' : v)}
          onPartsChange={p => { set('gotchaDate', p.exact); set('gotchaMonthYear', p.monthYear); set('gotchaYear', p.year); }}
        />
        {!gotchaValid && (
          <p className="text-base" style={{ color: PALETTE.red }}>Please enter a valid, non-future date.</p>
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
                if (!registered) { set('akc_registered_name', ''); set('akc_registration_number', ''); set('breeder', ''); }
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

      {showNotes && (
        <div className="space-y-1.5">
          <Label htmlFor="pet-notes">Notes</Label>
          <Textarea id="pet-notes" maxLength={500} rows={2} value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Anything important..." />
          <p className="text-sm text-muted-foreground text-right">{form.notes.length}/500</p>
        </div>
      )}
    </>
  );
}
