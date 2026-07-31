import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';

// Design System Amendment #8 (2026-07-30) — the canonical two-step
// "type X to confirm" destructive-delete flow, replacing the two
// independently-built copies in Settings.jsx (Delete Account) and
// PetProfileContent.jsx (Delete Pet). `step` is 0 (closed), 1 (warning),
// or 2 (type-to-confirm) — owned by the caller, since what triggers each
// transition differs (Settings has its own single-dialog-open-at-a-time
// state machine; PetProfileContent tracks its own delete flow separately).
export default function ConfirmDeleteDialog({
  step,
  onOpenChange,
  title,
  warning,
  confirmText,
  confirmLabel = 'Delete',
  confirmingLabel = 'Deleting…',
  confirming = false,
  confirmDisabled = false,
  error = '',
  onConfirm,
}) {
  const [typedText, setTypedText] = useState('');

  const close = () => {
    if (confirming) return;
    setTypedText('');
    onOpenChange(0);
  };

  return (
    <>
      <Dialog open={step === 1} onOpenChange={(v) => !v && close()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-2xl text-destructive">{title}</DialogTitle>
          </DialogHeader>
          <DialogDescription asChild>{warning}</DialogDescription>
          <DialogFooter className="mt-2 gap-2">
            <button onClick={close} className="flex-1 h-10 rounded-lg border border-border text-sm font-medium hover:bg-secondary transition-colors">Cancel</button>
            <button
              onClick={() => onOpenChange(2)}
              className="flex-1 h-10 rounded-lg bg-destructive text-destructive-foreground text-sm font-medium hover:bg-destructive/90 transition-colors"
            >
              Continue
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={step === 2} onOpenChange={(v) => !v && close()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-2xl text-destructive">Confirm Deletion</DialogTitle>
          </DialogHeader>
          <DialogDescription asChild>
            <div className="space-y-3 text-base text-muted-foreground">
              <p>Type <strong className="text-foreground font-mono">{confirmText}</strong> to confirm.</p>
            </div>
          </DialogDescription>
          <Input
            value={typedText}
            onChange={(e) => setTypedText(e.target.value)}
            placeholder={confirmText}
            className="font-mono"
            autoCapitalize="none"
            autoCorrect="off"
            disabled={confirming}
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter className="mt-2 gap-2">
            <button onClick={close} disabled={confirming} className="flex-1 h-10 rounded-lg border border-border text-sm font-medium hover:bg-secondary transition-colors disabled:opacity-50">Cancel</button>
            <button
              onClick={() => onConfirm(typedText)}
              disabled={typedText !== confirmText || confirming || confirmDisabled}
              className="flex-1 h-10 rounded-lg bg-destructive text-destructive-foreground text-sm font-medium hover:bg-destructive/90 transition-colors disabled:opacity-40"
            >
              {confirming ? confirmingLabel : confirmLabel}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
