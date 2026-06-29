import { Link } from 'react-router-dom';
import { UtensilsCrossed, Zap, Heart, Scale, Cat, Dog, Rainbow } from 'lucide-react';

// Redesigned pet card (replaces the original grid-based PetCard).
// Ported from a Base44 prototype build of the new design — same visual
// language as MockupPreview.jsx, wired to our real Supabase data
// instead of fake/mock data. Renamed props from cat/catId -> pet/petId
// and route from /cat/:id -> /pet/:id to match our existing app.

const appetiteMap = { 'Ate all': 'good', 'Ate most': 'good', 'Ate some': 'warn', 'Ate very little': 'warn', 'Refused': 'bad' };
const energyMap = { Playful: 'good', Normal: 'good', Calm: 'good', Lethargic: 'warn', Hiding: 'bad' };

const GLOW_COLOR = { good: '#6EBBE7', warn: '#f59e0b', bad: '#ef4444' };
const CHIP = {
  good: 'bg-emerald-500/12 text-emerald-400 border border-emerald-500/20',
  warn: 'bg-amber-500/12 text-amber-400 border border-amber-500/20',
  bad:  'bg-red-500/12 text-red-400 border border-red-500/20',
};

function getOverallStatus(latestLog) {
  if (!latestLog) return 'good';
  const signals = [];
  if (latestLog.appetite) signals.push(appetiteMap[latestLog.appetite] || 'good');
  if (latestLog.energy_level) signals.push(energyMap[latestLog.energy_level] || 'good');
  if (latestLog.vomiting > 2) signals.push('bad');
  else if (latestLog.vomiting > 0) signals.push('warn');
  if (signals.includes('bad')) return 'bad';
  if (signals.includes('warn')) return 'warn';
  return 'good';
}

export default function PetCard({ pet, latestLog }) {
  const isMemorial = pet.is_memorial;
  const status = isMemorial ? 'good' : getOverallStatus(latestLog);

  const chips = [];
  if (latestLog?.appetite) chips.push({ label: 'Appetite', icon: UtensilsCrossed, status: appetiteMap[latestLog.appetite] || 'good' });
  if (latestLog?.energy_level) chips.push({ label: 'Energy', icon: Zap, status: energyMap[latestLog.energy_level] || 'good' });
  if (latestLog?.vomiting != null) chips.push({ label: 'Symptoms', icon: Heart, status: latestLog.vomiting > 1 ? 'bad' : latestLog.vomiting > 0 ? 'warn' : 'good' });
  if (latestLog?.weight_grams != null) chips.push({ label: 'Weight', icon: Scale, status: 'good' });

  return (
    <Link to={`/pet/${pet.id}`} className="block active:scale-[0.98] transition-transform">
    <div className="flex items-stretch rounded-2xl overflow-hidden border border-white/6" style={{ background: 'rgba(255,255,255,0.05)' }}>
      {/* Status glow bar */}
      <div className="w-1 flex-shrink-0" style={{ background: GLOW_COLOR[status], boxShadow: `0 0 12px ${GLOW_COLOR[status]}80` }} />

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
        <div className="flex items-start justify-between gap-1">
          <div className="min-w-0">
            <p className="font-semibold text-white text-[20px] leading-snug truncate">{pet.name}</p>
            {pet.breed && <p className="text-[13px] text-white/35 mt-0.5 truncate">{pet.breed}</p>}
          </div>
        </div>

        {pet.conditions?.length > 0 && (
          <p className="text-[12px] text-white/40 mt-2 font-medium">
            {pet.conditions.join(' | ')}
          </p>
        )}

        {chips.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {chips.map(chip => {
              const Icon = chip.icon;
              return (
                <span key={chip.label} className={`flex items-center gap-1 text-[11px] font-semibold rounded-md px-2 py-0.5 ${CHIP[chip.status]}`}>
                  {Icon && <Icon className="h-3 w-3" />}
                  {chip.label}
                </span>
              );
            })}
          </div>
        )}

        {!latestLog && !isMemorial && (
          <p className="text-[11px] text-white/20 mt-2">No logs yet</p>
        )}
      </div>
    </div>
    </Link>
  );
}
