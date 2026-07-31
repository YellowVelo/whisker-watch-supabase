import { useLocation } from 'react-router-dom';
import { Sparkles } from 'lucide-react';
import { useAskWysker } from '@/lib/AskWyskerContext';
import { getPetContext } from '@/lib/petScreenContext';
import IconButton from '@/components/IconButton';

// The sheet itself is now owned by AskWyskerProvider (spec 0023 step 10),
// shared with PetProfileTabs' retiring "ai" tab redirect — this component
// is just the header button that opens it with the current route's context.
// Design System Amendment #11 (2026-07-30) — shares the same IconButton
// component as every other circular icon button, no "header action" exception.
export default function AskWyskerAction() {
  const location = useLocation();
  const { openAskWysker } = useAskWysker();

  return (
    <IconButton
      icon={Sparkles}
      onClick={() => openAskWysker(getPetContext(location.pathname))}
      aria-label="Ask Wysker"
      iconClassName="text-primary"
    />
  );
}
