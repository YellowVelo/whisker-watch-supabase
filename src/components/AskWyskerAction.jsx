import { useLocation } from 'react-router-dom';
import { Sparkles } from 'lucide-react';
import { useAskWysker } from '@/lib/AskWyskerContext';
import { getPetContext } from '@/lib/petScreenContext';

// The sheet itself is now owned by AskWyskerProvider (spec 0023 step 10),
// shared with PetProfileTabs' retiring "ai" tab redirect — this component
// is just the header button that opens it with the current route's context.
export default function AskWyskerAction() {
  const location = useLocation();
  const { openAskWysker } = useAskWysker();

  return (
    <button
      onClick={() => openAskWysker(getPetContext(location.pathname))}
      aria-label="Ask Wysker"
      className="relative h-11 w-11 rounded-full flex items-center justify-center flex-shrink-0 active:opacity-70 transition-opacity"
      style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}
    >
      <Sparkles className="h-5 w-5 text-primary" />
    </button>
  );
}
