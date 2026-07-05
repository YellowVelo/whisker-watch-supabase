import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Clock } from 'lucide-react';
import PageTransition from '@/components/PageTransition';

// Timeline (the complete chronological health story) is out of scope for
// Navigation Refresh — this is a placeholder destination so the Pet Profile
// section isn't removed while the real feature is built separately.
export default function Timeline() {
  const navigate = useNavigate();

  return (
    <PageTransition>
      <div className="min-h-screen bg-background pb-28">
        <header
          className="sticky top-0 z-10 bg-background/90 backdrop-blur border-b border-border"
          style={{ paddingTop: 'env(safe-area-inset-top)' }}
        >
          <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
            <button onClick={() => navigate(-1)} className="h-9 w-9 rounded-full bg-secondary flex items-center justify-center">
              <ArrowLeft className="h-5 w-5" />
            </button>
            <h1 className="font-serif text-2xl">Timeline</h1>
          </div>
        </header>
        <div className="max-w-2xl mx-auto px-4 py-20 text-center">
          <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
            <Clock className="h-8 w-8 text-primary" />
          </div>
          <h2 className="font-serif text-2xl mb-2">Timeline coming soon</h2>
          <p className="text-sm text-muted-foreground max-w-sm mx-auto">
            A complete chronological view of check-ins, observations, medications, weight, vaccinations, and health records is on the way.
          </p>
        </div>
      </div>
    </PageTransition>
  );
}
