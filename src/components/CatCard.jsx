import { Link } from 'react-router-dom';
import { getPetEmoji } from '@/lib/speciesConfig';
import { Cat } from 'lucide-react';
import { format } from 'date-fns';

const conditionColors = {
  IBD: 'bg-amber-100 text-amber-800',
  CKD: 'bg-blue-100 text-blue-800',
  Diabetes: 'bg-purple-100 text-purple-800',
  Hyperthyroidism: 'bg-rose-100 text-rose-800',
  Pancreatitis: 'bg-orange-100 text-orange-800',
  'Liver Disease': 'bg-green-100 text-green-800',
  Other: 'bg-gray-100 text-gray-800',
};

export default function CatCard({ cat, latestLog }) {
  const isMemorial = cat.is_memorial;
  return (
    <Link to={`/cat/${cat.id}`} className="block group active:scale-[0.97] transition-transform">
      <div className="bg-card rounded-2xl border border-border overflow-hidden shadow-sm transition-all duration-200 hover:shadow-lg hover:-translate-y-1 hover:border-primary/30 active:shadow-none">
        {/* Photo area */}
        <div className={`relative aspect-[3/4] overflow-hidden ${isMemorial ? 'bg-gradient-to-br from-purple-100 to-purple-50' : 'bg-gradient-to-br from-primary/10 to-accent/10'}`}>
          {cat.photo_url ? (
            <img src={cat.photo_url} alt={cat.name} className={`h-full w-full object-cover transition-transform duration-300 group-hover:scale-105 ${isMemorial ? 'grayscale' : ''}`} />
          ) : (
            <div className="h-full w-full flex items-center justify-center">
              <div className="text-center">
                <span className="text-6xl">{getPetEmoji(cat.species)}</span>
              </div>
            </div>
          )}
          {/* Gradient overlay at bottom */}
          <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/60 to-transparent" />
          {isMemorial && (
            <div className="absolute top-2 right-2 bg-purple-600/80 text-white text-xs px-2 py-0.5 rounded-full backdrop-blur-sm">🌈</div>
          )}
          <div className="absolute bottom-0 inset-x-0 p-3">
            <h3 className="font-serif text-xl text-white drop-shadow-sm">{cat.name}</h3>
            {cat.breed && <p className="text-xs text-white/80">{cat.breed}</p>}
          </div>
        </div>

        {/* Info area */}
        <div className="p-3 space-y-2">
          {cat.conditions?.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {cat.conditions.map(c => (
                <span key={c} className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${conditionColors[c] || conditionColors.Other}`}>{c}</span>
              ))}
            </div>
          )}
          {latestLog ? (
            <p className="text-xs text-muted-foreground">
              Logged {new Date(latestLog.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground/60">No logs yet</p>
          )}
        </div>
      </div>
    </Link>
  );
}