import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { entities } from '@/api/entities';
import IconButton from '@/components/IconButton';
import { Button } from '@/components/ui/button';
import PageTransition from '@/components/PageTransition';

const CONDITION_STATUS_LABELS = {
  diagnosed: 'Diagnosed condition',
  watching_closely: 'Watching closely',
  just_curious: 'Just curious',
};

const TRACKING_METHOD_LABELS = {
  none: "Doesn't track",
  notes_app: 'Notes app / memory',
  spreadsheet: 'Spreadsheet',
  another_app: 'Another app',
  paper_notebook: 'Paper notebook',
};

const BETA_COMFORT_LABELS = {
  yes: 'Comfortable with rough beta',
  prefer_to_wait: 'Prefer to wait',
};

// Admin-only review list for /beta signups (spec 0053) — every submission
// lands here for manual review, no auto-accept/reject logic. The
// open-text "frustration" answer is shown in full since that's the
// strongest qualitative signal per the copy doc's own notes.
export default function AdminBetaSignups() {
  const navigate = useNavigate();
  const [signups, setSignups] = useState(null);
  const [error, setError] = useState('');
  const [updatingId, setUpdatingId] = useState(null);

  useEffect(() => {
    let cancelled = false;
    entities.BetaSignup.list('-created_at')
      .then((data) => {
        if (!cancelled) setSignups(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || 'Failed to load signups');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const toggleReviewed = async (signup) => {
    setUpdatingId(signup.id);
    try {
      const updated = await entities.BetaSignup.update(signup.id, {
        reviewed_at: signup.reviewed_at ? null : new Date().toISOString(),
      });
      setSignups((prev) => prev.map((s) => (s.id === signup.id ? updated : s)));
    } catch (err) {
      setError(err.message || 'Failed to update signup');
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <PageTransition>
      <div className="min-h-screen pb-24">
        <header style={{ paddingTop: 'env(safe-area-inset-top)' }}>
          <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-3">
            <IconButton icon={ChevronLeft} onClick={() => navigate(-1)} aria-label="Back" />
            <h1 className="text-[28px] font-semibold">Beta Signups</h1>
          </div>
        </header>
        <main className="max-w-2xl mx-auto px-4 py-6 space-y-4">
          {error && <p className="text-[15px] text-destructive">{error}</p>}

          {signups === null && !error && (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )}

          {signups?.length === 0 && (
            <p className="text-[15px] text-muted-foreground text-center py-12">No signups yet.</p>
          )}

          {signups?.map((signup) => (
            <div key={signup.id} className="rounded-2xl bg-card border border-border p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[16px] font-semibold text-white truncate">{signup.email}</p>
                  <p className="text-[13px] text-tier-tertiary">
                    {format(new Date(signup.created_at), 'MMM d, yyyy h:mm a')}
                  </p>
                </div>
                <Button
                  type="button"
                  variant={signup.reviewed_at ? 'secondary' : 'outline'}
                  size="sm"
                  disabled={updatingId === signup.id}
                  onClick={() => toggleReviewed(signup)}
                  className="flex-shrink-0"
                >
                  {updatingId === signup.id ? <Loader2 className="h-4 w-4 animate-spin" /> : signup.reviewed_at ? 'Reviewed' : 'Mark reviewed'}
                </Button>
              </div>

              <div className="flex flex-wrap gap-2 text-[13px]">
                <span className="rounded-full px-3 py-1 bg-white/5 text-tier-secondary">
                  {CONDITION_STATUS_LABELS[signup.condition_status] || signup.condition_status}
                </span>
                <span className="rounded-full px-3 py-1 bg-white/5 text-tier-secondary">
                  {TRACKING_METHOD_LABELS[signup.tracking_method] || signup.tracking_method}
                </span>
                <span className="rounded-full px-3 py-1 bg-white/5 text-tier-secondary">
                  {BETA_COMFORT_LABELS[signup.beta_comfort] || signup.beta_comfort}
                </span>
              </div>

              <p className="text-[15px] text-white leading-relaxed whitespace-pre-wrap">{signup.frustration}</p>
            </div>
          ))}
        </main>
      </div>
    </PageTransition>
  );
}
