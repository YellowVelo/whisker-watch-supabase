import { Link, useNavigate } from 'react-router-dom';
import { Cat, Dog, Heart, Pill, CalendarDays, ChevronRight, Rainbow } from 'lucide-react';
import AttributeTrendChip, { DirectionIcon, DIRECTION_CONFIG } from '@/components/AttributeTrendChip';
import { getPetLabel } from '@/lib/speciesConfig';
import { computeDetailedAge } from '@/lib/lifeStage';

// Home's primary per-pet card (Health Score Revision V2, spec §9). One card
// per pet — full identity + medication count, plus (for active pets)
// today's 0-10 Health Score and exactly six directional chips (Appetite,
// Water, Bathroom, Stool, Vomiting, Weight). Tapping the card opens that
// pet's Trends. Memorial pets swap the score/chips for an "In Memory"
// marker instead. No Stable/Improving/Monitor/Declining wording remains —
// only up/equal/down/unknown direction (spec §8.3).

// Copy for each reason the score comparison can't show a direction
// (spec §9.2/§16).
const DIRECTION_REASON_COPY = {
  no_checkin_today: 'Check in today',
  missing_yesterday: 'Not enough data',
  skipped_yesterday: 'Not enough data',
  first_day: 'First day logged',
};

// Home's six required chips (spec §9.3) — five Health Attributes plus
// Weight. Order matches the approved Home screenshot.
const HOME_CHIP_SLOTS = [
  { code: 'appetite', label: 'Appetite' },
  { code: 'water_intake', label: 'Water' },
  { code: 'bathroom', label: 'Bathroom' },
  { code: 'stool', label: 'Stool' },
  { code: 'vomiting', label: 'Vomiting' },
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

export default function PetSummaryCard({
  pet, medicationCount = 0, checkIn, healthScore, attributeDirections, attributesUnavailable = false,
  weight, chipsLoading = false, highlighted = false, cardRef,
}) {
  const navigate = useNavigate();

  // Chips sit inside the card's own <Link to=".../trends"> — AttributeTrendChip
  // itself stops that outer navigation when interactive, so this only needs
  // to supply where the tap should actually go.
  const goToMetric = (metric) => () => {
    navigate(`/pet/${pet.id}/trends?section=trends&group=health&metric=${metric}`);
  };

  const identity = (
    <>
      <p className="text-[28px] font-bold text-white leading-tight truncate">{pet.name}</p>
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
        to={`/pet/${pet.id}/trends`}
        aria-label={`${pet.name}, in memory. View profile.`}
        className="block rounded-2xl px-4 py-4 active:opacity-80 transition-opacity"
        style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}
      >
        <div className="flex items-center gap-3.5">
          <PetPhoto pet={pet} size={64} memorial />
          <div className="flex-1 min-w-0">
            {identity}
            {(birthYear || memorialYear) && (
              <p className="text-[13px] text-white/35 mt-1.5 flex items-center gap-1.5">
                <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
                {birthYear && memorialYear ? `${birthYear} – ${memorialYear}` : birthYear || memorialYear}
              </p>
            )}
          </div>
          <div className="flex flex-col items-center gap-1 flex-shrink-0">
            <Rainbow className="h-6 w-6 text-purple-400" aria-hidden="true" />
            <p className="text-[13px] font-semibold text-purple-400 whitespace-nowrap">In Memory</p>
          </div>
          <ChevronRight className="h-4 w-4 text-white/25 flex-shrink-0" aria-hidden="true" />
        </div>
      </Link>
    );
  }

  const age = computeDetailedAge(pet);
  const conditions = pet.conditions?.length > 0 ? pet.conditions : null;
  const hasCheckedInToday = !!checkIn && checkIn.status !== 'skipped';
  const score = hasCheckedInToday ? (healthScore?.score ?? null) : null;
  const direction = hasCheckedInToday ? (healthScore?.direction ?? 'unknown') : 'unknown';
  const comparisonText = !checkIn
    ? 'Check in today'
    : checkIn.status === 'skipped'
      ? 'Not enough data'
      : (DIRECTION_REASON_COPY[healthScore?.directionReason] || 'versus yesterday');

  return (
    <Link
      ref={cardRef}
      to={`/pet/${pet.id}/trends`}
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
            <p className="text-[13px] text-white/40 mt-1 flex items-center gap-1.5">
              <CalendarDays className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
              {age}
            </p>
          )}
          <div className="flex flex-wrap gap-1.5 mt-2">
            {conditions ? (
              conditions.map((c) => (
                <span key={c} className="text-[13px] font-medium px-2.5 py-1 rounded-full" style={{ background: 'rgba(255,255,255,0.08)', color: '#fff' }}>
                  {c}
                </span>
              ))
            ) : (
              <span className="text-[13px] font-medium px-2.5 py-1 rounded-full flex items-center gap-1" style={{ background: 'rgba(76,199,176,0.15)', color: DIRECTION_CONFIG.up.color }}>
                <Heart className="h-3 w-3" aria-hidden="true" /> Healthy
              </span>
            )}
            {medicationCount > 0 && (
              <span className="text-[13px] font-medium px-2.5 py-1 rounded-full flex items-center gap-1" style={{ background: 'rgba(255,255,255,0.06)', color: '#fff' }}>
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
                    stroke={DIRECTION_CONFIG[direction]?.color || DIRECTION_CONFIG.unknown.color}
                    strokeWidth="4"
                    strokeDasharray={`${(score / 10) * 150.8} 150.8`}
                    strokeLinecap="round"
                  />
                )}
              </svg>
              <span className="text-[15px] font-bold text-white">{score != null ? score : '—'}<span className="text-[11px] font-semibold text-white/40">/10</span></span>
            </div>
            <p className="text-[13px] font-semibold mt-1 whitespace-nowrap flex items-center gap-1" style={{ color: score != null ? DIRECTION_CONFIG[direction]?.color : 'rgba(255,255,255,0.4)' }}>
              {score != null && <DirectionIcon direction={direction} className="h-3 w-3" />}
              {comparisonText}
            </p>
          </div>
          <ChevronRight className="h-4 w-4 text-white/25" aria-hidden="true" />
        </div>
      </div>

      <div className="mt-3.5 pt-3" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="grid grid-cols-2 gap-2">
          {HOME_CHIP_SLOTS.map(({ code, label }) => (
            <AttributeTrendChip
              key={code}
              label={label}
              direction={attributeDirections?.[code]}
              state={chipsLoading ? 'loading' : attributesUnavailable ? 'unavailable' : !hasCheckedInToday ? 'no-checkin' : 'ready'}
              interactive
              onClick={goToMetric(code)}
            />
          ))}
          <AttributeTrendChip
            label="Weight"
            direction={weight?.direction}
            comparisonLabel={weight?.comparisonLabel || 'Not enough data'}
            state={chipsLoading ? 'loading' : weight?.unavailable ? 'unavailable' : 'ready'}
            interactive
            onClick={goToMetric('weight')}
          />
        </div>
      </div>
    </Link>
  );
}
