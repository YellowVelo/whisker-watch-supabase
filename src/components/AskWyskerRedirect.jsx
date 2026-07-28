import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

// Small route-level bridge: redirects to `to`, carrying "open the Ask
// Wysker sheet" as navigation state rather than calling openAskWysker()
// directly — used for compatibility routes that used to be their own
// page, e.g. /settings/ai and PetProfileTabs' retiring "ai" tab (spec
// 0023 step 10).
//
// Navigation state, not a direct context call: App.jsx's
// <Routes key={location.pathname}> fully remounts everything inside
// <Routes> (including AskWyskerProvider) on every route change. Calling
// openAskWysker() here and then navigating away wiped the resulting
// open=true state right back out via that remount — the sheet would
// flash open for one render and immediately close. State survives the
// remount; AskWyskerProvider reads it back out once the new route mounts.
export default function AskWyskerRedirect({ petId, screen, to }) {
  const navigate = useNavigate();

  useEffect(() => {
    navigate(to, { replace: true, state: { openAskWysker: { petId: petId || null, screen: screen || null } } });
  }, [petId, screen, to, navigate]);

  return null;
}
