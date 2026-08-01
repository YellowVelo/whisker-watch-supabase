import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getConditionCategories } from '@/lib/speciesConfig';

// Card 2: Known Conditions. Species-specific, searchable, multi-select,
// optional. Selections write straight to pets.conditions (see migration
// 0012 for why there's no separate diagnoses field). Spec 0029 FR-008:
// conditions are grouped under category headers rather than one flat list.
export default function ConditionsCard({ petName, species, selected, onChange, onContinue, disabled }) {
  const [search, setSearch] = useState('');
  const categories = getConditionCategories(species);
  const term = search.trim().toLowerCase();
  const filteredCategories = useMemo(() => {
    if (!term) return categories;
    const result = {};
    for (const [category, conditions] of Object.entries(categories)) {
      const matches = conditions.filter((c) => c.toLowerCase().includes(term));
      if (matches.length) result[category] = matches;
    }
    return result;
  }, [categories, term]);
  const hasResults = Object.keys(filteredCategories).length > 0;

  const toggle = (c) => {
    onChange(selected.includes(c) ? selected.filter((x) => x !== c) : [...selected, c]);
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="space-y-1.5">
        <p className="text-xs font-semibold uppercase tracking-widest text-primary/70">Known Conditions</p>
        <h2 className="text-2xl font-semibold text-foreground leading-snug">
          Which conditions has {petName} been diagnosed with?
        </h2>
        <p className="text-sm text-muted-foreground">Optional — select any that apply.</p>
      </div>

      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search conditions..."
          aria-label="Search known conditions"
          className="w-full pl-10 pr-4 py-3 rounded-2xl bg-card border-2 border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 text-base"
        />
      </div>

      <div className="flex flex-col gap-4">
        {Object.entries(filteredCategories).map(([category, conditions]) => (
          <div key={category} className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">{category}</p>
            <div className="flex flex-wrap gap-2">
              {conditions.map((c) => {
                const active = selected.includes(c);
                return (
                  <button
                    key={c}
                    type="button"
                    aria-pressed={active}
                    disabled={disabled}
                    onClick={() => toggle(c)}
                    className={`px-4 py-2.5 rounded-full border-2 text-sm font-medium transition-colors min-h-[44px] disabled:opacity-60 ${
                      active
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-card text-foreground border-border hover:border-primary/50'
                    }`}
                  >
                    {c}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
        {!hasResults && (
          <p className="text-sm text-muted-foreground py-2">No conditions match "{search}".</p>
        )}
      </div>

      <Button className="w-full min-h-[52px] text-base" disabled={disabled} onClick={onContinue}>
        Continue
      </Button>
    </div>
  );
}
