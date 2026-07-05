import { Link } from 'react-router-dom';
import { Cat, Dog, Check, Clock, Minus, ChevronRight, Loader2 } from 'lucide-react';

const MAX_OBSERVATIONS = 3;

function formatTime(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

// Home's Today's Check-Ins card — one per active pet (Home Feature Spec
// #4). Tapping the card (outside the CTA) opens Pet Trends; the CTA
// launches the Daily Check-In flow via the parent-supplied handler.
export default function CheckInCard({ pet, checkIn, observations = [], onStartCheckIn, pending = false }) {
  const status = checkIn?.status;
  const trendsHref = `/pet/${pet.id}/profile?tab=trends`;
  const visibleObservations = observations.slice(0, MAX_OBSERVATIONS);
  const extraCount = Math.max(0, observations.length - MAX_OBSERVATIONS);

  return (
    <div className="rounded-2xl px-4 py-4" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
      <Link to={trendsHref} className="flex items-start gap-3 active:opacity-80 transition-opacity">
        <div className="h-11 w-11 rounded-full overflow-hidden flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(111,183,255,0.15)' }}>
          {pet.photo_url ? (
            <img src={pet.photo_url} alt="" className="w-full h-full object-cover" />
          ) : pet.species === 'Dog' ? (
            <Dog className="h-5 w-5 text-primary" />
          ) : (
            <Cat className="h-5 w-5 text-primary" />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-[17px] font-bold text-white">{pet.name}</p>
          <p className="text-[13px] text-white/40 mb-2">Today's Check-In</p>

          {status === 'normal' && (
            <StatusLine icon={<Check className="h-3.5 w-3.5" style={{ color: '#4CC7B0' }} />}>
              <p className="text-[14px] text-white/85">Everything looked normal today.</p>
              <p className="text-[12px] text-white/40 mt-0.5">Completed {formatTime(checkIn.completed_at)}</p>
            </StatusLine>
          )}

          {status === 'changed' && (
            <StatusLine icon={<Check className="h-3.5 w-3.5" style={{ color: '#4CC7B0' }} />}>
              {visibleObservations.length > 0 ? (
                <ul className="space-y-0.5">
                  {visibleObservations.map((label, i) => (
                    <li key={i} className="text-[14px] text-white/85 flex gap-1.5">
                      <span className="text-white/40">•</span>{label}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-[14px] text-white/85">Something changed today.</p>
              )}
              {extraCount > 0 && <p className="text-[13px] text-white/40 mt-0.5">+{extraCount} more</p>}
              <p className="text-[12px] text-white/40 mt-0.5">Completed {formatTime(checkIn.completed_at)}</p>
            </StatusLine>
          )}

          {status === 'skipped' && (
            <StatusLine icon={<Minus className="h-3.5 w-3.5 text-white/40" />}>
              <p className="text-[14px] text-white/60">Skipped today.</p>
              <p className="text-[12px] text-white/40 mt-0.5">Completed {formatTime(checkIn.completed_at)}</p>
            </StatusLine>
          )}

          {!status && (
            <StatusLine icon={<Clock className="h-3.5 w-3.5" style={{ color: '#F4C76B' }} />}>
              <p className="text-[14px] text-white/85">Today's check-in hasn't been completed.</p>
            </StatusLine>
          )}
        </div>

        <ChevronRight className="h-4 w-4 text-white/30 flex-shrink-0 mt-1" aria-hidden="true" />
      </Link>

      {!status && (
        <button
          type="button"
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); onStartCheckIn?.(); }}
          disabled={pending}
          className="w-full mt-3 rounded-xl text-[14px] font-semibold py-2.5 min-h-[44px] disabled:opacity-50 flex items-center justify-center"
          style={{ background: '#6FB7FF', color: '#0D0F12' }}
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Start Today's Check-In"}
        </button>
      )}
    </div>
  );
}

function StatusLine({ icon, children }) {
  return (
    <div className="flex items-start gap-2">
      <div className="mt-0.5 flex-shrink-0">{icon}</div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
