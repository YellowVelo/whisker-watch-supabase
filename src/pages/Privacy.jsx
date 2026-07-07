import { useNavigate } from 'react-router-dom';
import { ChevronLeft, ShieldCheck } from 'lucide-react';
import PageTransition from '../components/PageTransition';

// Placeholder destination for the Menu screen's "Privacy" row (Menu
// Feature Spec #3) — data/privacy management isn't specced yet, so this
// is a minimal stub matching existing sub-page patterns (see About.jsx).
export default function Privacy() {
  const navigate = useNavigate();
  return (
    <PageTransition>
      <div className="min-h-screen pb-24">
        <header style={{ paddingTop: 'env(safe-area-inset-top)' }}>
          <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-3">
            <button onClick={() => navigate(-1)} aria-label="Back" className="h-9 w-9 rounded-full bg-white/8 flex items-center justify-center flex-shrink-0">
              <ChevronLeft className="h-5 w-5 text-white" />
            </button>
            <h1 className="font-serif text-[28px]">Privacy</h1>
          </div>
        </header>
        <main className="max-w-2xl mx-auto px-4 py-16 text-center">
          <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
            <ShieldCheck className="h-8 w-8 text-primary" />
          </div>
          <p className="text-base text-muted-foreground">Privacy and data controls are coming soon.</p>
        </main>
      </div>
    </PageTransition>
  );
}
