import { useNavigate } from 'react-router-dom';
import { ChevronLeft, HelpCircle } from 'lucide-react';
import IconButton from '../components/IconButton';
import PageTransition from '../components/PageTransition';

// Placeholder destination for the Menu screen's "Support" row (Menu
// Feature Spec #3) — help center/contact support isn't specced yet, so
// this is a minimal stub matching existing sub-page patterns (see
// About.jsx).
export default function Support() {
  const navigate = useNavigate();
  return (
    <PageTransition>
      <div className="min-h-screen pb-24">
        <header style={{ paddingTop: 'env(safe-area-inset-top)' }}>
          <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-3">
            <IconButton icon={ChevronLeft} onClick={() => navigate(-1)} aria-label="Back" />
            <h1 className="text-[28px] font-semibold">Support</h1>
          </div>
        </header>
        <main className="max-w-2xl mx-auto px-4 py-16 text-center">
          <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
            <HelpCircle className="h-8 w-8 text-primary" />
          </div>
          <p className="text-base text-muted-foreground">Help center and contact support are coming soon.</p>
        </main>
      </div>
    </PageTransition>
  );
}
