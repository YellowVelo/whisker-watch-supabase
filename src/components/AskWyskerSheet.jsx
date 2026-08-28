import { useEffect, useState } from 'react';
import { X, Sparkles, MessageCircle } from 'lucide-react';
import { entities } from '@/api/entities';
import PetAIInsights from './PetAIInsights';
import PetAIChat from './PetAIChat';
import GeneralAskWyskerChat from './GeneralAskWyskerChat';
import AIDisclaimerBanner from './AIDisclaimerBanner';
import { Z } from '@/lib/zIndex';

// Global "Ask Wysker" overlay (spec 0023 step 5) — a non-navigating
// full-screen sheet, opened from AppHeader. Reuses PetAIInsights/PetAIChat
// completely unchanged when a pet is in context (same Insights/Ask a
// Question toggle PetProfileTabs' retiring "ai" tab used); falls back to
// GeneralAskWyskerChat (household-wide, new) when opened with no pet in
// context (e.g. from Home).
//
// Closing this never navigates — it's plain boolean state, not a route —
// so "return to the exact screen" is automatic rather than something this
// component has to engineer.
export default function AskWyskerSheet({ open, onOpenChange, context }) {
  const { petId, screen } = context || {};

  const [pet, setPet] = useState(null);
  const [logs, setLogs] = useState([]);
  const [medications, setMedications] = useState([]);
  const [baseline, setBaseline] = useState(null);
  const [allPets, setAllPets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [aiTab, setAiTab] = useState('insights');

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setAiTab('insights');

    if (petId) {
      Promise.all([
        entities.Pet.get(petId),
        entities.SymptomLog.filter({ pet_id: petId }, '-date', 200),
        entities.Medication.filter({ pet_id: petId }, '-start_date', 50),
        entities.PetOnboarding.filter({ pet_id: petId }),
      ])
        .then(([petData, logData, medData, onboardingRows]) => {
          setPet(petData);
          setLogs(logData);
          setMedications(medData);
          setBaseline(onboardingRows[0] || null);
        })
        .finally(() => setLoading(false));
    } else {
      entities.Pet.list('-created_date')
        .then((pets) => setAllPets(pets.filter((p) => !p.is_memorial)))
        .finally(() => setLoading(false));
    }
  }, [open, petId]);

  if (!open) return null;

  const close = () => onOpenChange(false);

  return (
    <div className={`fixed inset-0 ${Z.overlay} bg-background overflow-y-auto`}>
      <div
        className="sticky z-10 bg-background border-b border-border px-4 py-3 flex items-center justify-between"
        style={{ top: 0, paddingTop: 'calc(env(safe-area-inset-top) + 12px)' }}
      >
        <div className="min-w-0">
          <h2 className="text-2xl font-semibold flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" /> Ask Wysker
          </h2>
          {pet && (
            <p className="text-sm text-muted-foreground truncate">{pet.name}{screen ? ` · ${screen}` : ''}</p>
          )}
        </div>
        <button onClick={close} aria-label="Close" className="h-9 w-9 rounded-full bg-secondary flex items-center justify-center flex-shrink-0">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="px-4 py-5 pb-32 max-w-2xl mx-auto">
        <AIDisclaimerBanner />
        {loading ? (
          <div className="text-center py-16">
            <div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin mx-auto" />
          </div>
        ) : petId && pet ? (
          <>
            <div className="flex gap-2 mb-4">
              <button
                onClick={() => setAiTab('insights')}
                className={`flex-1 py-2 rounded-xl text-sm font-medium transition-colors ${
                  aiTab === 'insights' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'
                }`}
              ><Sparkles className="h-3.5 w-3.5 inline mr-1" /> Insights</button>
              <button
                onClick={() => setAiTab('chat')}
                className={`flex-1 py-2 rounded-xl text-sm font-medium transition-colors ${
                  aiTab === 'chat' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'
                }`}
              ><MessageCircle className="h-3.5 w-3.5 inline mr-1" /> Ask a Question</button>
            </div>
            {aiTab === 'insights'
              ? <PetAIInsights pet={pet} logs={logs} medications={medications} baseline={baseline} screen={screen} />
              : <PetAIChat pet={pet} medications={medications} baseline={baseline} screen={screen} />
            }
          </>
        ) : (
          <GeneralAskWyskerChat pets={allPets} />
        )}
      </div>
    </div>
  );
}
