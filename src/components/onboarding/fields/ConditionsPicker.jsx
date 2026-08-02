import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { getConditionCategories } from '@/lib/speciesConfig';

// Search box + category-grouped condition chip grid. Shared by onboarding's
// ConditionsCard (a wizard step, "Continue" button lives in the caller) and
// the standalone Conditions page (a normal single-screen edit, "Save
// Changes" button lives in the caller) — this component only owns the
// picking UI, not the surrounding step/page chrome or copy.
export default function ConditionsPicker({ species, selected, onChange, disabled }) {
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
    <div className="flex flex-col gap-4">
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
    </div>
  );
}
