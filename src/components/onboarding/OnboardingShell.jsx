import { useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, ChevronLeft } from 'lucide-react';
import IconButton from '@/components/IconButton';
import useFocusTrap from '@/hooks/useFocusTrap';
import { Z } from '@/lib/zIndex';

// Spec 0029: full-screen onboarding shell, modeled directly on
// CatchUpFlow.jsx's overlay pattern (the closest existing precedent for a
// genuinely multi-step, resumable, full-screen flow) rather than
// BottomSheet, which only covers part of the viewport. Portaled to
// document.body for the same reason CatchUpFlow is: Home/PageTransition's
// motion.div carries a transform even at rest, which would otherwise make
// "fixed inset-0" size itself to the page's scroll height instead of the
// real viewport.
//
// Spec 0045: also picked up CatchUpFlow's dialog role + focus trap (via the
// shared useFocusTrap hook) — each onboarding step is its own mount here
// rather than internal state like CatchUpFlow's `step`, so no `focusKey` is
// needed; the hook's mount-time focus already covers a step change.
export default function OnboardingShell({ title, stepNumber, totalSteps, onBack = undefined, onClose, closeLabel = 'Close', footer = undefined, children }) {
  const dialogRef = useRef(null);
  useFocusTrap(dialogRef, onClose);

  return createPortal((
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className={`fixed inset-0 ${Z.overlay} flex flex-col bg-background`}
      style={{ paddingTop: 'calc(var(--account-banner-height, 0px) + env(safe-area-inset-top))', paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <header className="px-5 pt-5 pb-3 flex-shrink-0 border-b border-border">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            {onBack && <IconButton icon={ChevronLeft} onClick={onBack} aria-label="Back" />}
            <h2 className="text-lg font-bold text-white truncate">{title}</h2>
          </div>
          {onClose && <IconButton icon={X} onClick={onClose} aria-label={closeLabel} />}
        </div>
        {stepNumber && totalSteps && (
          <div className="mt-3 space-y-1.5" role="progressbar" aria-valuenow={stepNumber} aria-valuemin={1} aria-valuemax={totalSteps} aria-label={`Step ${stepNumber} of ${totalSteps}`}>
            <p className="text-[13px] font-medium text-tier-tertiary text-center">Step {stepNumber} of {totalSteps}</p>
            <div className="flex gap-1.5 justify-center">
              {Array.from({ length: totalSteps }, (_, i) => (
                <span
                  key={i}
                  className={`h-1.5 rounded-full transition-all ${i < stepNumber ? 'bg-primary w-6' : 'bg-border w-1.5'}`}
                />
              ))}
            </div>
          </div>
        )}
      </header>

      <div className="flex-1 overflow-y-auto px-5 py-5 max-w-md w-full mx-auto">
        {children}
      </div>

      {footer && (
        <div className="flex-shrink-0 border-t border-border bg-card px-5 py-4">
          {footer}
        </div>
      )}
    </div>
  ), document.body);
}
