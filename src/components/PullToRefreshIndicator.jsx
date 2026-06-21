import { RefreshCw } from 'lucide-react';

export default function PullToRefreshIndicator({ pullDistance, isRefreshing, threshold = 70 }) {
  const visible = pullDistance > 10 || isRefreshing;
  if (!visible) return null;

  const progress = Math.min(pullDistance / threshold, 1);
  const ready = progress >= 1;

  return (
    <div
      className="fixed top-0 left-0 right-0 z-50 flex justify-center pointer-events-none"
      style={{ paddingTop: `calc(env(safe-area-inset-top) + ${isRefreshing ? 16 : Math.min(pullDistance * 0.4, 24)}px)` }}
    >
      <div className={`flex items-center gap-2 px-4 py-2 rounded-full bg-card border border-border shadow-md text-xs font-medium transition-all ${ready || isRefreshing ? 'text-primary' : 'text-muted-foreground'}`}>
        <RefreshCw
          className={`h-3.5 w-3.5 transition-transform ${isRefreshing ? 'animate-spin' : ''}`}
          style={{ transform: `rotate(${isRefreshing ? 0 : progress * 360}deg)` }}
        />
        {isRefreshing ? 'Refreshing…' : ready ? 'Release to refresh' : 'Pull to refresh'}
      </div>
    </div>
  );
}