import { AlertTriangle } from 'lucide-react';
import { AI_DISCLAIMER_BANNER_TEXT } from '@/lib/aiGuardrails';

// Fixed, non-AI-generated disclaimer (spec 0041) — rendered once by
// AskWyskerSheet above the Insights/Chat tab toggle so it's visible
// regardless of tab or mode, rather than depending on the AI remembering
// to include a disclaimer in its own reply text. Same visual treatment
// PetAIInsights.jsx already used for its own inline disclaimer box,
// extracted here so it isn't duplicated per screen.
export default function AIDisclaimerBanner() {
  return (
    <div className="flex gap-2 p-3 bg-muted/40 rounded-xl border border-border/50 mb-4">
      <AlertTriangle className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
      <p className="text-base text-muted-foreground leading-relaxed">{AI_DISCLAIMER_BANNER_TEXT}</p>
    </div>
  );
}
