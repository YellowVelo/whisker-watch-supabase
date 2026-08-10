import { AlertTriangle } from 'lucide-react';

// Shown in place of an AI reply when the request itself failed — a rate
// limit (spec 0050) or any other error (network, server). Distinct from
// AIEmergencyNotice: this is an app/request problem, not a pet-safety
// redirect, so it uses the warn (amber) tone rather than bad (red).
export default function AIErrorNotice({ message }) {
  return (
    <div
      className="flex gap-3 p-4 rounded-xl border"
      style={{ background: 'rgba(244,199,107,0.12)', borderColor: 'rgba(244,199,107,0.35)' }}
      role="alert"
    >
      <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" style={{ color: 'var(--tone-warn)' }} />
      <p className="text-sm leading-relaxed font-medium" style={{ color: 'var(--tone-warn)' }}>
        {message}
      </p>
    </div>
  );
}
