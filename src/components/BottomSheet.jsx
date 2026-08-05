import { useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import IconButton from './IconButton';
import useFocusTrap from '@/hooks/useFocusTrap';

// Design System Amendment #8 (2026-07-30) — the canonical bottom-sheet
// shell, replacing three independently hand-built copies (DailyCheckInSheet,
// PetProfileContent's WeightQuickLogSheet, BulkApplySheet). Owns the
// backdrop, drag handle, header/close button, focus trap, and Escape-to-
// close; callers own everything inside (body content + footer).
//
// `focusKey` re-runs the focus-trap effect (re-focusing the first
// focusable element) whenever it changes — pass whatever value marks a
// meaningful "new screen within the sheet" for the caller (e.g. a wizard
// stage), matching the original per-sheet behavior exactly rather than
// re-trapping on every render.
export default function BottomSheet({ titleId = 'bottom-sheet-title', title, subtitle = undefined, onClose, children, footer = undefined, focusKey = undefined }) {
  const dialogRef = useRef(null);
  useFocusTrap(dialogRef, onClose, focusKey);

  // Portaled to document.body (launch-punch-list P4) — rendered inline,
  // this sheet's `fixed inset-0` isn't actually pinned to the real
  // viewport: PageTransition.jsx wraps every page in a Framer Motion
  // `motion.div`, which applies a `transform` even at rest, and per the
  // CSS spec any transformed ancestor becomes the containing block for
  // `position: fixed` descendants. So instead of anchoring to the ~800px
  // visible viewport, it was anchoring to the page's full (often 3000px+)
  // scrollable height — invisible when the sheet opens near scrollY≈0,
  // but the footer (e.g. "Continue") renders off-screen once the caller
  // has scrolled the page down first. The same portal-to-body technique is
  // also used by CatchUpFlow.jsx/OnboardingShell.jsx's full-screen overlays
  // (spec 0045 gave them this component's dialog role + focus trap too, via
  // the shared useFocusTrap hook — they're no longer just visually similar).
  return createPortal((
    <div className="fixed inset-0 z-50 flex flex-col justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative rounded-t-3xl shadow-2xl max-h-[85vh] flex flex-col bg-card border border-border"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 pt-5 pb-3 flex-shrink-0">
          <div className="w-10 h-1 bg-white/20 rounded-full mx-auto mb-4" />
          <div className="flex items-center justify-between">
            <h3 id={titleId} className="text-xl font-bold text-white">{title}</h3>
            <IconButton icon={X} onClick={onClose} aria-label="Close" />
          </div>
          {subtitle}
        </div>

        <div className="px-5 overflow-y-auto flex-1 pb-2">{children}</div>

        {footer && (
          <div className="px-5 pt-3 flex-shrink-0 border-t border-border" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 1.5rem)' }}>{footer}</div>
        )}
      </div>
    </div>
  ), document.body);
}
