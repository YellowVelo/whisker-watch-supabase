import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Sparkles } from 'lucide-react';
import { entities } from '@/api/entities';
import {
  HEALTH_OPTIONS, MEDICATIONS_YES_NO_OPTIONS, APPETITE_OPTIONS, WATER_OPTIONS, ENERGY_OPTIONS,
  getMobilityOptions, getBathroomOptions,
} from '@/lib/onboardingConfig';

// Every value collected during Pet Onboarding is editable afterward from
// here — onboarding creates the pet's *initial* baseline, it isn't
// permanent (see "01 Feature Pet Management 0002 Pet Onboarding.md").
export default function BaselineSection({ petId, petName, species }) {
  const [row, setRow] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const existing = await entities.PetOnboarding.filter({ pet_id: petId });
    setRow(existing[0] || null);
    setLoading(false);
  };

  useEffect(() => { load(); }, [petId]);

  const update = async (patch) => {
    const updated = await entities.PetOnboarding.update(row.id, patch);
    setRow(updated);
  };

  if (loading) {
    return <div className="py-8 text-center text-sm text-muted-foreground">Loading baseline...</div>;
  }

  if (!row) {
    return (
      <div className="text-center py-8 border border-dashed border-border rounded-xl">
        <p className="text-sm text-muted-foreground mb-2">{petName}'s baseline hasn't been set up yet.</p>
        <Link to={`/pet/${petId}/onboarding`} className="inline-flex items-center gap-1.5 text-sm text-primary font-medium">
          <Sparkles className="h-3.5 w-3.5" /> Complete {petName}'s Profile
        </Link>
      </div>
    );
  }

  const fields = [
    { key: 'health_status', label: `${petName}'s overall health`, options: HEALTH_OPTIONS(petName) },
    { key: 'medications_status', label: 'Currently on medications', options: MEDICATIONS_YES_NO_OPTIONS },
    { key: 'appetite_baseline', label: 'Finishes meals', options: APPETITE_OPTIONS },
    { key: 'water_baseline', label: 'Drinks water', options: WATER_OPTIONS },
    { key: 'energy_baseline', label: 'Energy', options: ENERGY_OPTIONS },
    { key: 'mobility_baseline', label: 'Moves around', options: getMobilityOptions(species) },
    { key: 'bathroom_baseline', label: 'Uses the bathroom', options: getBathroomOptions(species) },
  ];

  return (
    <div className="space-y-5">
      {!row.completed_at && (
        <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-primary/10 border border-primary/25">
          <Sparkles className="h-3.5 w-3.5 text-primary flex-shrink-0" />
          <p className="text-sm text-foreground">
            Onboarding is still in progress.{' '}
            <Link to={`/pet/${petId}/onboarding`} className="text-primary font-medium">Continue it</Link>
          </p>
        </div>
      )}
      {fields.map((f) => (
        <div key={f.key} className="space-y-1.5">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{f.label}</p>
          <div className="flex flex-wrap gap-2">
            {f.options.map((opt) => {
              const active = row[f.key] === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => update({ [f.key]: opt.value })}
                  className={`text-xs px-3 py-1.5 rounded-full border transition-colors min-h-[36px] ${
                    active ? 'bg-primary text-primary-foreground border-primary' : 'bg-background text-foreground border-border hover:border-primary/50'
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
