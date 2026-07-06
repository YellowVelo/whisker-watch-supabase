import { Link } from 'react-router-dom';
import { Cat, Dog } from 'lucide-react';

// Home's Wellness Summary card — one per active pet, horizontally
// scrollable row. Tapping opens Pet Trends (Home Feature Spec #3).
// Score/trend values are consumed as-is from the Wellness Score system
// (src/lib/checkin) — never recalculated here.

const DOT_COLOR = { stable: '#4CC7B0', improving: '#6FB7FF', monitor: '#F4C76B', declining: '#E57373', unknown: '#A9AEB5' };
const TREND_LABEL = { stable: 'Stable', improving: 'Improving', monitor: 'Monitor', declining: 'Declining', unknown: 'Unknown' };

export default function WellnessCard({ pet, wellness }) {
  const score = wellness?.latest?.score ?? null;
  const trend = wellness?.trend ?? 'unknown';
  const dotColor = DOT_COLOR[trend] || DOT_COLOR.unknown;

  return (
    <Link
      to={`/pet/${pet.id}/trends`}
      className="flex-shrink-0 w-[140px] rounded-2xl px-4 py-4 flex flex-col items-center text-center active:opacity-80 transition-opacity"
      style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}
    >
      <div className="h-14 w-14 rounded-full overflow-hidden flex items-center justify-center mb-2.5 flex-shrink-0" style={{ background: 'rgba(111,183,255,0.15)' }}>
        {pet.photo_url ? (
          <img src={pet.photo_url} alt="" className="w-full h-full object-cover" />
        ) : pet.species === 'Dog' ? (
          <Dog className="h-6 w-6 text-primary" />
        ) : (
          <Cat className="h-6 w-6 text-primary" />
        )}
      </div>
      <p className="text-[15px] font-semibold text-white truncate w-full">{pet.name}</p>
      <p className="text-[26px] font-bold text-white leading-tight mt-0.5">{score != null ? score : '—'}</p>
      <p className="text-[13px] font-medium mt-1 flex items-center gap-1.5" style={{ color: dotColor }}>
        <span className="h-1.5 w-1.5 rounded-full flex-shrink-0" style={{ background: dotColor }} aria-hidden="true" />
        {TREND_LABEL[trend]}
      </p>
    </Link>
  );
}
