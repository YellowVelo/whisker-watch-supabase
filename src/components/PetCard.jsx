import { Link } from 'react-router-dom';
import { Cat, Dog, Rainbow, Loader2 } from 'lucide-react';

// Redesigned pet card (replaces the original grid-based PetCard).
// Ported from a Base44 prototype build of the new design — same visual
// language as MockupPreview.jsx, wired to our real Supabase data
// instead of fake/mock data. Renamed props from cat/catId -> pet/petId
// and route from /cat/:id -> /pet/:id to match our existing app.
//
// Status now comes from the Wellness Score / Daily Check-In system
// (src/lib/checkin) rather than the legacy SymptomLog fields.

const GLOW_COLOR = { good: '#4CC7B0', warn: '#F4C76B', bad: '#E57373', neutral: '#6FB7FF' };

function getStatusTone(score) {
  if (score == null) return 'neutral';
  if (score >= 90) return 'good';
  if (score >= 75) return 'warn';
  if (score >= 60) return 'warn';
  return 'bad';
}

const TREND_LABEL = { stable: 'Stable', improving: 'Improving', monitor: 'Monitor', declining: 'Declining', unknown: null };

export default function PetCard({ pet, wellness, checkIn, onMarkNormal, onOpenChanged, onSkip, actionPending }) {
  const isMemorial = pet.is_memorial;
  const score = wellness?.latest?.score ?? null;
  const trend = wellness?.trend;
  const tone = isMemorial ? 'neutral' : getStatusTone(score);

  const checkedInToday = checkIn?.status === 'normal' || checkIn?.status === 'changed';
  const skippedToday = checkIn?.status === 'skipped';

  let statusLine;
  if (isMemorial) statusLine = null;
  else if (checkIn?.status === 'changed') statusLine = checkIn.notes || 'Something changed today';
  else if (checkIn?.status === 'normal') statusLine = 'Today checked in';
  else if (skippedToday) statusLine = 'Skipped today';
  else statusLine = 'Not checked in today';

  return (
    <div className="rounded-2xl overflow-hidden border border-white/6" style={{ background: 'rgba(255,255,255,0.05)' }}>
      <Link to={`/pet/${pet.id}`} className="flex items-stretch active:scale-[0.99] transition-transform">
        {/* Status glow bar */}
        <div className="w-1 flex-shrink-0" style={{ background: GLOW_COLOR[tone], boxShadow: `0 0 12px ${GLOW_COLOR[tone]}80` }} />

        {/* Photo */}
        <div className="relative w-24 flex-shrink-0" style={{ minHeight: 104 }}>
          {pet.photo_url ? (
            <img src={pet.photo_url} alt={pet.name} className={`w-full h-full object-cover ${isMemorial ? 'grayscale opacity-50' : ''}`} style={{ minHeight: 104 }} />
          ) : (
            <div className="w-full h-full flex items-center justify-center" style={{ minHeight: 104, background: 'rgba(255,255,255,0.04)' }}>
              {pet.species === 'Dog' ? <Dog className="h-8 w-8 text-white/50" /> : <Cat className="h-8 w-8 text-white/50" />}
            </div>
          )}
          {isMemorial && (
            <div className="absolute top-2 right-2 bg-purple-500/70 text-white px-1.5 py-0.5 rounded-full backdrop-blur-sm"><Rainbow className="h-3 w-3" /></div>
          )}
        </div>

        {/* Info */}
        <div className="flex-1 px-4 py-3 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="font-semibold text-white text-[20px] leading-snug truncate">{pet.name}</p>
              {pet.breed && <p className="text-[13px] text-white/35 mt-0.5 truncate">{pet.breed}</p>}
            </div>
            {!isMemorial && (
              <div className="text-right flex-shrink-0">
                <p className="text-[22px] font-bold text-white leading-none">{score != null ? score : '—'}</p>
                {trend && TREND_LABEL[trend] && (
                  <p className="text-[11px] font-medium mt-0.5" style={{ color: GLOW_COLOR[tone] }}>{TREND_LABEL[trend]}</p>
                )}
              </div>
            )}
          </div>

          {pet.conditions?.length > 0 && (
            <p className="text-[12px] text-white/40 mt-1.5 font-medium truncate">{pet.conditions.join(' | ')}</p>
          )}

          {statusLine && <p className="text-[12px] text-white/40 mt-1.5">{statusLine}</p>}
        </div>
      </Link>

      {!isMemorial && !checkedInToday && !skippedToday && (
        <div className="flex items-center gap-2 px-4 pb-3 pt-1">
          <QuickActionButton label="Normal" primary onClick={onMarkNormal} disabled={actionPending} />
          <QuickActionButton label="Change" onClick={onOpenChanged} disabled={actionPending} />
          <QuickActionButton label="Skip" subtle onClick={onSkip} disabled={actionPending} />
        </div>
      )}
      {!isMemorial && (checkedInToday || skippedToday) && (
        <div className="px-4 pb-3 pt-1">
          <button
            type="button"
            onClick={onOpenChanged}
            disabled={actionPending}
            className="text-xs font-semibold text-white/40 disabled:opacity-50"
          >
            Edit today's check-in
          </button>
        </div>
      )}
    </div>
  );
}

function QuickActionButton({ label, onClick, primary, subtle, disabled }) {
  return (
    <button
      type="button"
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); onClick?.(); }}
      disabled={disabled}
      className="flex-1 rounded-xl text-[13px] font-semibold py-2.5 min-h-[40px] transition-all active:opacity-70 disabled:opacity-40 flex items-center justify-center gap-1.5"
      style={primary
        ? { background: '#4CC7B0', color: '#0D0F12' }
        : subtle
          ? { background: 'transparent', color: 'rgba(255,255,255,0.45)', border: '1px solid rgba(255,255,255,0.1)' }
          : { background: 'rgba(255,255,255,0.08)', color: '#fff', border: '1px solid rgba(255,255,255,0.12)' }}
    >
      {disabled ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : label}
    </button>
  );
}
