import { useEffect } from 'react';

const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

// Extracted from BottomSheet.jsx (spec 0045) so full-screen overlay shells
// (CatchUpFlow, OnboardingShell) get the same modal keyboard behavior
// instead of each hand-rolling their own copy. Traps Tab/Shift+Tab within
// `dialogRef`'s subtree, focuses the first focusable element on mount and
// whenever `focusKey` changes (pass a value that marks a meaningful "new
// screen within the dialog" for callers with internal step state), and
// closes on Escape via `onClose` (a no-op if `onClose` isn't provided).
export default function useFocusTrap(dialogRef, onClose, focusKey = undefined) {
  useEffect(() => {
    const node = dialogRef.current;
    const focusables = () => Array.from(node?.querySelectorAll(FOCUSABLE) || []).filter((el) => !el.disabled);
    focusables()[0]?.focus();

    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose?.();
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
}
