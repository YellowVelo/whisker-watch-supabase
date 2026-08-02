import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { entities } from '@/api/entities';
import IconButton from '@/components/IconButton';
import PageTransition from '@/components/PageTransition';
import ConditionsPicker from '@/components/onboarding/fields/ConditionsPicker';

// Spec 0036: Conditions split out of the old EditPetSheet onto its own
// routed page, reusing the same grouped + searchable picker onboarding's
// ConditionsCard uses instead of the flat ungrouped list Edit Pet used to
// show. Writes only pets.conditions — no other pet field is touched here.
export default function PetConditions() {
  const { petId } = useParams();
  const navigate = useNavigate();
  const [pet, setPet] = useState(null);
  const [conditions, setConditions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    entities.Pet.get(petId)
      .then((p) => { setPet(p); setConditions(p.conditions || []); })
      .catch(() => setError("We couldn't load this pet."))
      .finally(() => setLoading(false));
  }, [petId]);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await entities.Pet.update(pet.id, { conditions });
      navigate('/pets');
    } catch (err) {
      console.error('Failed to save conditions:', err);
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
          <h1 className="text-[28px] font-semibold text-white flex-1">Conditions</h1>
        </div>

        <div className="max-w-2xl mx-auto px-4 py-5">
          {loading || !pet ? (
            <div className="flex justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="flex flex-col gap-5">
              <p className="text-sm text-muted-foreground">Chronic conditions and diagnoses for {pet.name}.</p>

              <ConditionsPicker species={pet.species} selected={conditions} onChange={setConditions} disabled={saving} />

              {error && <p className="text-sm text-destructive" role="alert">{error}</p>}

              <Button className="w-full" onClick={handleSave} disabled={saving}>
                {saving ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Saving…</> : 'Save Changes'}
              </Button>
            </div>
          )}
        </div>
      </div>
    </PageTransition>
  );
}
