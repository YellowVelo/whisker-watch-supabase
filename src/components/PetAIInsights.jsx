import { useState } from 'react';
import { invokeAI, aiScreen } from '@/api/aiClient';
import { Sparkles, RefreshCw, AlertTriangle, CircleCheck, Lightbulb } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PALETTE, PALETTE_SOFT } from '@/lib/toneColors';
import { aiErrorText } from '@/lib/aiGuardrails';
import AIEmergencyNotice from './AIEmergencyNotice';
import AIErrorNotice from './AIErrorNotice';

// Spec 0080 FR8: the server reads the pet's last 30 days of daily
// check-ins (Vibe and symptoms, kept separate), medications, baseline and
// weight itself; the app sends only the pet's id and the screen. With fewer
// than 2 non-skipped check-ins it answers { not_enough_data: true } without
// calling the AI.
export default function PetAIInsights({ pet, screen }) {
  const [insights, setInsights] = useState(null);
  const [urgent, setUrgent] = useState(false);
  const [notEnoughData, setNotEnoughData] = useState(false);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [generated, setGenerated] = useState(false);

  const generateInsights = async () => {
    setLoading(true);
    setGenerated(true);
    setUrgent(false);
    setError(null);
    setNotEnoughData(false);
    try {
      const result = await invokeAI({
        task: 'pet_insights',
        pet_id: pet.id,
        screen: aiScreen(screen),
      });

      if (result?.not_enough_data) {
        setNotEnoughData(true);
        setInsights(null);
        return;
      }

      // Backstop: discard the generated analysis entirely and show only the
      // hard-stop redirect if the AI flagged this as urgent — same principle
      // as PetAIChat, no AI-generated content shown for a real emergency.
      if (result?.urgent) {
        setUrgent(true);
        setInsights(null);
      } else {
        setInsights(result);
      }
    } catch (err) {
      // Covers both the new rate limit (spec 0050) and any other AI
      // failure — without this, loading below never resolved and the
      // button just spun forever with no explanation.
      setError(aiErrorText(err));
      setInsights(null);
    } finally {
      setLoading(false);
    }
  };

  const iconFor = (type) => {
    if (type === 'warning') return { background: PALETTE_SOFT.amber, color: PALETTE.amber, icon: AlertTriangle };
    if (type === 'positive') return { background: PALETTE_SOFT.teal, color: PALETTE.teal, icon: CircleCheck };
    return { background: PALETTE_SOFT.sky, color: PALETTE.sky, icon: Lightbulb };
  };

  return (
    <div className="space-y-4">
      {!generated && !loading && (
        <div className="text-center py-8">
          <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
            <Sparkles className="h-8 w-8 text-primary" />
          </div>
          <p className="text-sm font-medium mb-1">AI Health Insights</p>
          <p className="text-base text-muted-foreground mb-4 max-w-xs mx-auto">
            Get a veterinary perspective on {pet.name}'s recent health trends and patterns.
          </p>
          <Button onClick={generateInsights} className="gap-2">
            <Sparkles className="h-4 w-4" /> Analyze {pet.name}'s Records
          </Button>
        </div>
      )}

      {loading && (
        <div className="text-center py-10">
          <div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Reviewing {pet.name}'s health records…</p>
        </div>
      )}

      {urgent && !loading && <AIEmergencyNotice petName={pet.name} />}

      {notEnoughData && !loading && (
        <p className="text-base text-muted-foreground bg-muted/50 rounded-xl px-4 py-3 leading-relaxed">
          <strong className="font-semibold text-foreground">Not enough check-ins yet.</strong>{' '}
          Insights look at {pet.name}'s last 30 days of daily check-ins. Check in on at least 2 days and they'll be ready.
        </p>
      )}

      {error && !loading && (
        <div className="space-y-3">
          <AIErrorNotice message={error} />
          <div className="text-center">
            <Button onClick={generateInsights} variant="outline" className="gap-2">
              <RefreshCw className="h-4 w-4" /> Try Again
            </Button>
          </div>
        </div>
      )}

      {insights && !loading && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold flex items-center gap-1.5"><Sparkles className="h-4 w-4 text-primary" /> AI Health Analysis</p>
            <button onClick={generateInsights} className="text-[13px] text-muted-foreground flex items-center gap-1 hover:text-foreground transition-colors min-h-0 h-auto py-1">
              <RefreshCw className="h-3 w-3" /> Refresh
            </button>
          </div>

          {insights.summary && (
            <p className="text-sm text-muted-foreground bg-muted/50 rounded-xl px-4 py-3 leading-relaxed">{insights.summary}</p>
          )}

          <div className="space-y-2">
            {insights.insights?.map((item, i) => {
              const style = iconFor(item.type);
              const StyleIcon = style.icon;
              return (
                <div key={i} className="p-3.5 rounded-xl border border-transparent" style={{ background: style.background }}>
                  <p className="flex items-center gap-1.5 text-sm font-semibold mb-0.5" style={{ color: style.color }}><StyleIcon className="h-3.5 w-3.5" /> {item.title}</p>
                  <p className="text-base opacity-90 leading-relaxed" style={{ color: style.color }}>{item.detail}</p>
                </div>
              );
            })}
          </div>

          {insights.disclaimer && (
            <div className="flex gap-2 p-3 bg-muted/40 rounded-xl border border-border/50">
              <AlertTriangle className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
              <p className="text-base text-muted-foreground leading-relaxed">{insights.disclaimer}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}