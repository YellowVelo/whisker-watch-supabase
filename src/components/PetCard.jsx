import { Link } from 'react-router-dom';
import { Cat, Dog, Heart, Pill, CalendarDays, ChevronRight, Rainbow } from 'lucide-react';
import { getCategory } from '@/lib/checkin/config';
import { getChipState } from '@/lib/checkin/chipLabels';
import { getPetLabel } from '@/lib/speciesConfig';
import { computeDetailedAge } from '@/lib/lifeStage';

// Pets screen card (Pets Feature Spec #3/#4). One card per pet — full
// identity + status chips + medication count, plus (for active pets)
// today's Wellness Score and a fixed 6-slot Today's Logs summary. Memorial
// pets swap the score/logs for an "In Memory" marker instead.

const TONE_COLOR = { good: '#4CC7B0', warn: '#F4C76B', bad: '#E57373', unknown: '#A9AEB5' };
const TREND_COLOR = { stable: '#4CC7B0', improving: '#6FB7FF', monitor: '#F4C76B', declining: '#E57373', unknown: '#A9AEB5' };
const TREND_LABEL = { stable: 'Stable', improving: 'Improving', monitor: 'Monitor', declining: 'Declining', unknown: null };

// Fixed Today's Logs slots (Pets Feature Spec #3: "Current design supports:
// Appetite, Water, Energy, Stool, Activity, Other"). "Activity" maps to the
// Daily Check-In's `mobility` category — same data, screen-specific label.
const LOG_SLOTS = [
  { code: 'appetite', label: 'Appetite' },
  { code: 'water_intake', label: 'Water' },
  { code: 'energy', label: 'Energy' },
  { code: 'stool', label: 'Stool' },
  { code: 'mobility', label: 'Activity' },
  { code: 'other', label: 'Other' },
];

function PetPhoto({ pet, size, memorial }) {
  return (
    <div
      className="relative rounded-full overflow-hidden flex items-center justify-center flex-shrink-0"
      style={{ width: size, height: size, background: 'rgba(255,255,255,0.06)' }}
    >
      {pet.photo_url ? (
        <img
          src={pet.photo_url}
          alt=""
          className={`w-full h-full object-cover ${memorial ? 'grayscale' : ''}`}
        />
      ) : pet.species === 'Dog' ? (
        <Dog className="h-1/2 w-1/2 text-white/40" />
      ) : (
        <Cat className="h-1/2 w-1/2 text-white/40" />
      )}
    </div>
  );
}

export default function PetCard({ pet, medicationCount = 0, wellness, checkIn, observationValues, logsUnavailable = false, highlighted = false, cardRef }) {
  const identity = (
    <>
      <p className="text-[19px] font-bold text-white leading-tight truncate">{pet.name}</p>
      <p className="text-[13px] text-white/45 mt-0.5 truncate">
        {getPetLabel(pet.species)}{pet.breed ? ` · ${pet.breed}` : ''}{pet.sex ? ` · ${pet.sex}` : ''}
      </p>
    </>
  );

  if (pet.is_memorial) {
    const birthYear = pet.birth_date ? new Date(pet.birth_date).getFullYear() : null;
    const memorialYear = pet.memorial_date ? new Date(pet.memorial_date).getFullYear() : null;
    return (
      <Link
        ref={cardRef}
        to={`/pet/${pet.id}`}
        aria-label={`${pet.name}, in memory. View profile.`}
        className="block rounded-2xl px-4 py-4 active:opacity-80 transition-opacity"
        style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}
      >
        <div className="flex items-center gap-3.5">
          <PetPhoto pet={pet} size={64} memorial />
          <div className="flex-1 min-w-0">
            {identity}
            {(birthYear || memorialYear) && (
              <p className="text-[12px] text-white/35 mt-1.5 flex items-center gap-1.5">
                <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
                {birthYear && memorialYear ? `${birthYear} – ${memorialYear}` : birthYear || memorialYear}
              </p>
            )}
          </div>
          <div className="flex flex-col items-center gap-1 flex-shrink-0">
            <Rainbow className="h-6 w-6 text-purple-400" aria-hidden="true" />
            <p className="text-[12px] font-semibold text-purple-400 whitespace-nowrap">In Memory</p>
          </div>
          <ChevronRight className="h-4 w-4 text-white/25 flex-shrink-0" aria-hidden="true" />
        </div>
      </Link>
    );
  }

  const age = computeDetailedAge(pet);
  const conditions = pet.conditions?.length > 0 ? pet.conditions : null;
  const status = checkIn?.status;
  const todayStr = new Date().toISOString().split('T')[0];
  const hasTodayScore = wellness?.latest?.check_in_date === todayStr;
  const score = hasTodayScore ? wellness.latest.score : null;
  const trend = hasTodayScore ? (wellness?.trend ?? 'unknown') : null;

  return (
    <Link
      ref={cardRef}
      to={`/pet/${pet.id}`}
      aria-label={`${pet.name}. View profile.`}
      className="block rounded-2xl px-4 py-4 active:opacity-80 transition-opacity"
      style={{
        background: 'rgba(255,255,255,0.05)',
        border: highlighted ? '1px solid rgba(111,183,255,0.5)' : '1px solid rgba(255,255,255,0.08)',
        boxShadow: highlighted ? '0 0 0 3px rgba(111,183,255,0.15)' : undefined,
      }}
    >
      <div className="flex items-start gap-3.5">
        <PetPhoto pet={pet} size={72} />

        <div className="flex-1 min-w-0">
          {identity}
          {age && (
            <p className="text-[12px] text-white/40 mt-1 flex items-center gap-1.5">
              <CalendarDays className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
              {age}
            </p>
          )}
          <div className="flex flex-wrap gap-1.5 mt-2">
            {conditions ? (
              conditions.map((c) => (
                <span key={c} className="text-[11px] font-medium px-2.5 py-1 rounded-full" style={{ background: 'rgba(255,255,255,0.08)', color: '#fff' }}>
                  {c}
                </span>
              ))
            ) : (
              <span className="text-[11px] font-medium px-2.5 py-1 rounded-full flex items-center gap-1" style={{ background: 'rgba(76,199,176,0.15)', color: TONE_COLOR.good }}>
                <Heart className="h-3 w-3" aria-hidden="true" /> Healthy
              </span>
            )}
            {medicationCount > 0 && (
              <span className="text-[11px] font-medium px-2.5 py-1 rounded-full flex items-center gap-1" style={{ background: 'rgba(255,255,255,0.06)', color: '#fff' }}>
                <Pill className="h-3 w-3" aria-hidden="true" /> {medicationCount} Medication{medicationCount === 1 ? '' : 's'}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <div className="flex flex-col items-center">
            <div className="relative w-14 h-14 flex items-center justify-center">
              <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 56 56">
                <circle cx="28" cy="28" r="24" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="4" />
                {score != null && (
                  <circle
                    cx="28" cy="28" r="24" fill="none"
                    stroke={TREND_COLOR[trend] || TREND_COLOR.unknown}
                    strokeWidth="4"
                    strokeDasharray={`${(score / 100) * 150.8} 150.8`}
                    strokeLinecap="round"
                  />
                )}
              </svg>
              <span className="text-[18px] font-bold text-white">{score != null ? score : '—'}</span>
            </div>
            {score != null && TREND_LABEL[trend] && (
              <p className="text-[12px] font-semibold mt-1 whitespace-nowrap" style={{ color: TREND_COLOR[trend] }}>{TREND_LABEL[trend]}</p>
            )}
            {score != null && <p className="text-[11px] text-white/35">Today</p>}
          </div>
          <ChevronRight className="h-4 w-4 text-white/25" aria-hidden="true" />
        </div>
      </div>

      <div className="mt-3.5 pt-3" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        <p className="text-[10px] font-semibold tracking-widest uppercase text-white/30 mb-2">Today's Logs</p>
        <div className="grid grid-cols-3 gap-2">
          {LOG_SLOTS.map(({ code, label }) => {
            const Icon = getCategory(code)?.icon;
            const { label: value, tone } = getChipState(code, status, observationValues, { unavailable: logsUnavailable });
            return (
              <div key={code} className="rounded-xl px-2.5 py-2 flex items-center gap-1.5" style={{ background: 'rgba(255,255,255,0.04)' }}>
                {Icon && <Icon className="h-3.5 w-3.5 text-white/40 flex-shrink-0" aria-hidden="true" />}
                <div className="min-w-0">
                  <p className="text-[11px] text-white/40 truncate">{label}</p>
                  <p className="text-[12px] font-semibold truncate" style={{ color: TONE_COLOR[tone] }}>{value}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </Link>
  );
}
