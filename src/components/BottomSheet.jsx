import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

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
export default function BottomSheet({ titleId = 'bottom-sheet-title', title, subtitle, onClose, children, footer, focusKey }) {
  const dialogRef = useRef(null);

  useEffect(() => {
    const node = dialogRef.current;
    const focusables = () => Array.from(node?.querySelectorAll(FOCUSABLE) || []).filter((el) => !el.disabled);
    focusables()[0]?.focus();

    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;
      const items = focusables();
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusKey]);

  return (
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
            <button onClick={onClose} aria-label="Close" className="h-9 w-9 rounded-full bg-white/8 flex items-center justify-center flex-shrink-0">
              <X className="h-4 w-4 text-white" />
            </button>
          </div>
          {subtitle}
        </div>

        <div className="px-5 overflow-y-auto flex-1 pb-2">{children}</div>

        {footer && (
          <div className="px-5 pt-3 pb-10 flex-shrink-0 border-t border-border">{footer}</div>
        )}
      </div>
    </div>
  );
}
