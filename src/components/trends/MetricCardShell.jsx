import { Skeleton } from '@/components/ui/skeleton';
import { ChevronRight } from 'lucide-react';

// Shared shell for every Trends metric card — handles loading skeleton,
// error message, and empty state so each card only has to supply its own
// data-fetch + content. This is what makes each card "independent" per
// the Trends Feature Spec (a failure in one never blocks the others).
export default function MetricCardShell({ icon: Icon, title, periodLabel, loading, error, empty, emptyMessage, emptyAction = null, children }) {
  return (
    <div className="rounded-2xl px-4 pt-4 pb-4" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {Icon && <Icon className="h-4 w-4 text-white/40" aria-hidden="true" />}
          <p className="text-[12px] font-semibold text-white/50 uppercase tracking-wide">{title}</p>
        </div>
        <div className="flex items-center gap-1 text-white/30">
          <span className="text-[13px]">{periodLabel}</span>
          <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
        </div>
      </div>

      {loading ? (
        <div className="space-y-2" aria-busy="true" aria-label={`Loading ${title}`}>
          <Skeleton className="h-8 w-24" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : error ? (
        <p className="text-[13px] text-white/40 py-3 text-center">Unable to load trend.</p>
      ) : empty ? (
        <div className="py-3 text-center">
          <p className="text-[13px] text-white/40 mb-2">{emptyMessage}</p>
          {emptyAction}
        </div>
      ) : (
        children
      )}
    </div>
  );
}
