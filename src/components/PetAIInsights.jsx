import { useState } from 'react';
import { invokeAI } from '@/api/aiClient';
import { Sparkles, RefreshCw, AlertTriangle, CircleCheck, Lightbulb } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PALETTE } from '@/lib/toneColors';
import { formatBaselineForAI } from '@/lib/baselineContext';
import { AI_DISCLAIMER_SENTENCE, URGENT_FLAG_INSTRUCTION } from '@/lib/aiGuardrails';
import AIEmergencyNotice from './AIEmergencyNotice';

export default function PetAIInsights({ pet, logs, medications, bloodwork, baseline, screen }) {
  const [insights, setInsights] = useState(null);
  const [urgent, setUrgent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [generated, setGenerated] = useState(false);

  const buildContext = () => {
    const recentLogs = logs.slice(0, 30);
    const logSummary = recentLogs.map(l =>
      `Date: ${l.date}, Appetite: ${l.appetite || 'N/A'}, Energy: ${l.energy_level || 'N/A'}, Vomiting: ${l.vomiting ?? 0}, Stool: ${l.stool_quality || 'N/A'}, Weight: ${l.weight_grams ? (l.weight_grams / 453.6).toFixed(2) + ' lbs' : 'N/A'}${l.notes ? ', Notes: ' + l.notes : ''}`
    ).join('\n');

    const activeMeds = medications?.filter(m => m.active).map(m => `${m.name} ${m.dosage || ''} ${m.frequency || ''}`).join(', ') || 'None';
    const conditions = pet.conditions?.join(', ') || 'None noted';
    const species = pet.species || 'Cat';
    const age = pet.birth_date ? Math.floor((new Date() - new Date(pet.birth_date)) / (365.25 * 24 * 60 * 60 * 1000)) : null;
    const baselineSummary = formatBaselineForAI(baseline, pet.name, pet.species);

    return `
Pet Name: ${pet.name}
Species: ${species}
${age ? `Age: ${age} years` : ''}
Breed: ${pet.breed || 'Unknown'}
Known Conditions: ${conditions}
Active Medications: ${activeMeds}
${baselineSummary ? `Established Baseline (owner-reported normal): ${baselineSummary}` : ''}
${screen ? `The owner just came from ${pet.name}'s ${screen} screen, so lean toward that topic first if it's relevant.` : ''}

Recent Health Logs (most recent first):
${logSummary || 'No recent logs.'}
    `.trim();
  };

  const generateInsights = async () => {
    setLoading(true);
    setGenerated(true);
    setUrgent(false);
    const context = buildContext();
    const result = await invokeAI({
      prompt: `You are a compassionate, experienced veterinarian with 20+ years of clinical practice reviewing a pet's health record. Analyze the following medical data and provide 3-5 specific, actionable observations or concerns. Focus on trends, anomalies, or patterns in the data. Be concise and practical. ${AI_DISCLAIMER_SENTENCE} ${URGENT_FLAG_INSTRUCTION}

${context}

Respond in JSON with this structure:
{
  "summary": "1-2 sentence overall health summary",
  "insights": [
    { "type": "warning|info|positive", "title": "Short title", "detail": "1-2 sentences" }
  ],
  "disclaimer": "brief disclaimer",
  "urgent": false
}`,
      response_json_schema: {
        type: "object",
        properties: {
          summary: { type: "string" },
          insights: {
            type: "array",
            items: {
              type: "object",
              properties: {
                type: { type: "string" },
                title: { type: "string" },
                detail: { type: "string" }
              }
            }
          },
          disclaimer: { type: "string" },
          urgent: { type: "boolean" }
        }
      }
    });

    // Backstop: discard the generated analysis entirely and show only the
    // hard-stop redirect if the AI flagged this as urgent — same principle
    // as PetAIChat, no AI-generated content shown for a real emergency.
    if (result?.urgent) {
      setUrgent(true);
      setInsights(null);
      setLoading(false);
      return;
    }
    setInsights(result);
    setLoading(false);
  };

  const iconFor = (type) => {
    if (type === 'warning') return { background: 'rgba(244,199,107,0.15)', color: PALETTE.amber, icon: AlertTriangle };
    if (type === 'positive') return { background: 'rgba(76,199,176,0.15)', color: PALETTE.teal, icon: CircleCheck };
    return { background: 'rgba(111,183,255,0.15)', color: PALETTE.sky, icon: Lightbulb };
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