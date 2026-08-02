import { AlertTriangle } from 'lucide-react';
import { emergencyRedirectText } from '@/lib/aiGuardrails';

// Fixed, hard-stop emergency redirect (spec 0041) — shown in place of an AI
// answer, never alongside one. No bypass/continue action of any kind, by
// deliberate product decision (2026-08-02): a keyword match or an
// AI-flagged "urgent" response ends that turn here. Call your vet, don't
// ask Wysker Watch.
export default function AIEmergencyNotice({ petName }) {
  return (
    <div
      className="flex gap-3 p-4 rounded-xl border"
      style={{ background: 'rgba(229,115,115,0.12)', borderColor: 'rgba(229,115,115,0.35)' }}
      role="alert"
    >
      <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" style={{ color: 'var(--tone-bad)' }} />
      <p className="text-sm leading-relaxed font-medium" style={{ color: 'var(--tone-bad)' }}>
        {emergencyRedirectText(petName)}
      </p>
    </div>
  );
}
