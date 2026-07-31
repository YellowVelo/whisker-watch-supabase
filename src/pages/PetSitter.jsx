import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import PetSittingSection from '../components/PetSittingSection';
import IconButton from '../components/IconButton';
import PageTransition from '../components/PageTransition';

// Household-level Pet Sitter page (spec 0023 step 6) — thin wrapper around
// the existing PetSittingSection with no petId, so it shows sits across
// every pet instead of one pet's. No new sitter logic, permissions, or
// data model — same component PetProfileTabs' retiring "petsit" tab
// already used, just mounted without a scope filter. Reached from Home,
// which stays the active bottom tab (see BottomTabBar.jsx).
export default function PetSitter() {
  const navigate = useNavigate();

  return (
    <PageTransition>
      <div className="min-h-screen pb-28">
        <header className="px-4 flex items-center gap-3" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 12px)' }}>
          <IconButton icon={ArrowLeft} onClick={() => navigate(-1)} aria-label="Back" />
          <div className="min-w-0">
            <h1 className="text-[28px] font-bold text-foreground">Pet Sitter</h1>
            <p className="text-[14px] text-tier-tertiary">Manage sitting periods and sitter access.</p>
          </div>
        </header>

        <main className="max-w-2xl mx-auto px-4 pt-4">
          <PetSittingSection />
        </main>
      </div>
    </PageTransition>
  );
}
