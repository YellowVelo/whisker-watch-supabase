import { Link, useNavigate } from 'react-router-dom';
import { Cat, Dog, Heart, Pill, CalendarDays, ChevronRight, Rainbow } from 'lucide-react';
import AttributeTrendChip, { DIRECTION_CONFIG } from '@/components/AttributeTrendChip';
import VibeIcon, { vibeAccessibleLabel } from '@/components/VibeIcon';
import { getPetLabel } from '@/lib/speciesConfig';
import { computeDetailedAge } from '@/lib/lifeStage';
import { PALETTE } from '@/lib/toneColors';

// Home's primary per-pet card (Daily Check-In, Vibe & Trends spec v5). One
// card per pet — full identity + medication count, plus (for active pets)
// today's Vibe icon and six directional chips (Appetite, Water, Bathroom,
// Stool, Vomiting, Nausea). Weight is its own line beneath the chip grid,
// not a 7th chip. Tapping the card opens that pet's Trends. Memorial pets
// swap the Vibe icon/chips for an "In Memory" marker instead. No score of
// any kind is shown here — only the Vibe self-report and up/equal/down/
// unknown symptom-count directions.

// Home's six Health Attribute chips (spec Attribute Model — now includes
// Nausea). Order matches the approved Home screenshot.
const HOME_CHIP_SLOTS = [
  { code: 'appetite', label: 'Appetite' },
  { code: 'water_intake', label: 'Water' },
  { code: 'bathroom', label: 'Bathroom' },
  { code: 'stool', label: 'Stool' },
  { code: 'vomiting', label: 'Vomiting' },
  { code: 'nausea', label: 'Nausea' },
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
  pet, medicationCount = 0, checkIn, attributeDirections, attributesUnavailable = false,
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
  const vibeStatus = checkIn?.status ?? null;

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
          <div className="flex flex-col items-center" role="img" aria-label={vibeAccessibleLabel(vibeStatus)}>
            <VibeIcon status={vibeStatus} size={32} />
            <p className="text-[13px] font-semibold mt-1 whitespace-nowrap" style={{ color: PALETTE.sky }}>
              {vibeStatus ? { great: 'Great Day', off: 'Off Day', tough: 'Tough Day', skipped: 'Skipped' }[vibeStatus] : 'Check in today'}
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
        </div>
        <div className="mt-2">
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
