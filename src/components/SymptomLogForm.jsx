import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import SmartSelect from './SmartSelect';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { entities } from '@/api/entities';
import { Loader2 } from 'lucide-react';

const today = () => new Date().toISOString().split('T')[0];

export default function SymptomLogForm({ petId, onOptimisticUpdate, onSuccess }) {
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    pet_id: petId,
    date: today(),
    appetite: '',
    vomiting: 0,
    stool_quality: '',
    energy_level: '',
    water_intake: '',
    urination: '',
    weight_lbs: '',
    nausea_symptoms: [],
    pain_signs: false,
    medication_given: false,
    notes: '',
  });

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    const data = { ...form };
    if (data.weight_lbs === '') delete data.weight_lbs;
    else { data.weight_grams = Math.round(Number(data.weight_lbs) * 453.592); }
    delete data.weight_lbs;

    // Optimistic: close immediately with temp data
    if (onOptimisticUpdate) {
      const tempLog = { ...data, id: `temp-${Date.now()}` };
      onOptimisticUpdate(tempLog);
    }

    await entities.SymptomLog.create(data);
    setSaving(false);
    onSuccess?.();
  };

  const SelectField = ({ label, field, options }) => (
    <div className="space-y-1.5">
      <Label className="text-sm font-medium">{label}</Label>
      <SmartSelect value={form[field]} onValueChange={v => set(field, v)} placeholder="Select..." options={options} />
    </div>
  );

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="space-y-1.5">
        <Label className="text-sm font-medium">Date</Label>
        <Input type="date" value={form.date} onChange={e => set('date', e.target.value)} />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <SelectField label="Appetite" field="appetite" options={['Ate all', 'Ate most', 'Ate some', 'Ate very little', 'Refused']} />
        <SelectField label="Energy Level" field="energy_level" options={['Normal', 'Playful', 'Calm', 'Lethargic', 'Hiding']} />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <SelectField label="Stool Quality" field="stool_quality" options={['Normal', 'Soft', 'Loose', 'Watery', 'Bloody', 'Constipated', 'None']} />
        <SelectField label="Water Intake" field="water_intake" options={['Normal', 'Increased', 'Decreased', 'Not observed']} />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <SelectField label="Urination" field="urination" options={['None', 'Reduced', 'Normal', 'Frequent', 'Excessive']} />
        <div className="space-y-1.5">
          <Label className="text-sm font-medium">Vomiting Episodes</Label>
          <Input type="number" min="0" value={form.vomiting} onChange={e => set('vomiting', parseInt(e.target.value) || 0)} />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label className="text-sm font-medium">Weight (lbs)</Label>
        <Input type="number" step="0.1" placeholder="Optional" value={form.weight_lbs} onChange={e => set('weight_lbs', e.target.value)} />
      </div>

      <div className="space-y-2">
        <Label className="text-sm font-medium">Nausea Symptoms</Label>
        <div className="flex flex-wrap gap-2">
          {['Lip licking', 'Burping', 'Drooling', 'Ate non-food items', 'Hunched posture'].map(symptom => {
            const checked = form.nausea_symptoms.includes(symptom);
            return (
              <button
                key={symptom}
                type="button"
                onClick={() => set('nausea_symptoms', checked ? form.nausea_symptoms.filter(s => s !== symptom) : [...form.nausea_symptoms, symptom])}
                className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                  checked ? 'bg-primary text-primary-foreground border-primary' : 'bg-background text-foreground border-border hover:border-primary/50'
                }`}
              >
                {symptom}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex gap-8">
        <div className="flex items-center gap-2">
          <Switch checked={form.pain_signs} onCheckedChange={v => set('pain_signs', v)} />
          <Label className="text-sm">Signs of Pain</Label>
        </div>
        <div className="flex items-center gap-2">
          <Switch checked={form.medication_given} onCheckedChange={v => set('medication_given', v)} />
          <Label className="text-sm">Medication Given</Label>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label className="text-sm font-medium">Notes</Label>
        <Textarea placeholder="Anything noteworthy today..." value={form.notes} onChange={e => set('notes', e.target.value)} rows={3} />
      </div>

      <Button type="submit" className="w-full" disabled={saving}>
        {saving ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Saving...</> : 'Save Log'}
      </Button>
    </form>
  );
}