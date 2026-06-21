import { useState } from 'react';
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { entities } from '@/api/entities';

export default function MemorialDialog({ pet, open, onOpenChange, onSuccess }) {
  const [date, setDate] = useState(pet?.memorial_date || new Date().toISOString().split('T')[0]);
  const [saving, setSaving] = useState(false);

  const handleConfirm = async () => {
    setSaving(true);
    await entities.Pet.update(pet.id, { is_memorial: true, memorial_date: date });
    setSaving(false);
    onSuccess?.();
    onOpenChange(false);
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="font-serif text-xl">🌈 Crossed the Rainbow Bridge</AlertDialogTitle>
          <AlertDialogDescription className="text-sm leading-relaxed">
            Mark <strong>{pet?.name}</strong>'s profile as a memorial. Their health history and memories will be lovingly preserved.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-2 py-1">
          <Label className="text-sm font-medium">Date they passed</Label>
          <Input type="date" value={date} onChange={e => setDate(e.target.value)} />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <Button
            onClick={handleConfirm}
            disabled={saving}
            className="bg-purple-600 hover:bg-purple-700 text-white"
          >
            {saving ? 'Saving…' : '🌈 Create Memorial'}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}