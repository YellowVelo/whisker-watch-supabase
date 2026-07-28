import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import AskWyskerSheet from '@/components/AskWyskerSheet';

// Lifts AskWyskerSheet's open/context state above the header (spec 0023
// step 10) so more than one caller can open it — the header's own
// AskWyskerAction button, and now also the redirect that replaces
// PetProfileTabs' retiring "ai" tab. Still plain boolean state, not a
// route, per the original design (Phase 3/Risk Assessment) — opening this
// never navigates, so "return to the exact screen" stays automatic.
//
// App.jsx's <Routes key={location.pathname}> (pre-existing, drives the
// page-transition animations) fully unmounts and remounts everything
// inside <Routes> — including this provider — on every route change. That
// makes "open the sheet, then navigate" from the same synchronous call
// impossible: the navigate() wipes the open=true state right back out via
// the remount. AskWyskerRedirect works around this by passing the intent
// through navigation state instead, which survives the remount — this
// provider reads it back out once mounted, then clears it.
const AskWyskerCtx = createContext(null);

export function AskWyskerProvider({ children }) {
  const [open, setOpen] = useState(false);
  const [context, setContext] = useState(null);
  const location = useLocation();
  const navigate = useNavigate();

  const openAskWysker = useCallback((ctx) => {
    setContext(ctx || null);
    setOpen(true);
  }, []);

  useEffect(() => {
    const pending = location.state?.openAskWysker;
    if (!pending) return;
    openAskWysker(pending);
    const { openAskWysker: _discard, ...restState } = location.state;
    navigate(location.pathname + location.search, { replace: true, state: restState, preventScrollReset: true });
    // Runs once per mount to consume a one-shot navigation-state flag —
    // not on every location change, which would re-open the sheet on
    // ordinary in-shell navigation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <AskWyskerCtx.Provider value={{ openAskWysker }}>
      {children}
      <AskWyskerSheet open={open} onOpenChange={setOpen} context={context} />
    </AskWyskerCtx.Provider>
  );
}

export function useAskWysker() {
  const ctx = useContext(AskWyskerCtx);
  if (!ctx) throw new Error('useAskWysker must be used within AskWyskerProvider');
  return ctx;
}
