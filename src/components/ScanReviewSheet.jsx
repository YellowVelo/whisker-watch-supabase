import { Loader2 } from 'lucide-react';
import BottomSheet from '@/components/BottomSheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { PALETTE } from '@/lib/toneColors';

// Review step for the Vaccination "Scan Record" AI scan (spec 0061).
// Nothing from a scan is saved until the owner confirms here — this is
// what replaces the old behavior of saving the AI's read immediately.
// `groups` is one entry per pet the scanned document was attributed to
// (usually just the pet being viewed, but a multi-pet invoice can produce
// more than one), each with its own list of editable, checkable items.
export default function ScanReviewSheet({ groups, saving, onToggle, onEdit, onConfirm, onClose }) {
  const includedCount = groups.reduce((n, g) => n + g.items.filter((i) => i.included).length, 0);

  const subtitle = (
    <p className="text-[13px] text-muted-foreground mt-2">
      Check the details below before saving — nothing is added or changed until you confirm.
    </p>
  );

  const footer = (
    <Button onClick={onConfirm} className="w-full" disabled={saving || includedCount === 0}>
      {saving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Saving...</> : `Save ${includedCount} Vaccination${includedCount === 1 ? '' : 's'}`}
    </Button>
  );

  return (
    <BottomSheet titleId="scan-review-title" title="Review Scanned Vaccinations" subtitle={subtitle} onClose={onClose} footer={footer}>
      <div className="space-y-5 pb-2">
        {groups.map((group) => (
          <div key={group.petId} className="space-y-2">
            <p className="text-sm font-semibold text-white">{group.petName}</p>
            <div className="space-y-2">
              {group.items.map((item) => (
                <div key={item.key} className="border border-border rounded-xl p-3 bg-card">
                  <label className="flex items-start gap-3 min-h-11 cursor-pointer">
                    <Checkbox
                      checked={item.included}
                      onCheckedChange={() => onToggle(group.petId, item.key)}
                      className="mt-2"
                    />
                    <div className="flex-1 min-w-0 space-y-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Input
                          value={item.vaccine_name}
                          onChange={(e) => onEdit(group.petId, item.key, 'vaccine_name', e.target.value)}
                          onClick={(e) => e.stopPropagation()}
                          className="h-9 text-sm font-medium flex-1 min-w-[140px]"
                          placeholder="Vaccine name"
                        />
                        <span
                          className="text-[13px] px-2 py-0.5 rounded-full shrink-0"
                          style={{
                            background: item.matchedExistingId ? 'rgba(244,199,107,0.15)' : 'rgba(111,183,255,0.15)',
                            color: item.matchedExistingId ? PALETTE.amber : PALETTE.sky,
                          }}
                        >
                          {item.matchedExistingId ? 'Will update' : 'New'}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <p className="text-[13px] text-muted-foreground">Date Given</p>
                          <Input
                            type="date"
                            value={item.date_given}
                            onChange={(e) => onEdit(group.petId, item.key, 'date_given', e.target.value)}
                            onClick={(e) => e.stopPropagation()}
                            className="h-9 text-sm"
                          />
                        </div>
                        <div className="space-y-1">
                          <p className="text-[13px] text-muted-foreground">Next Due</p>
                          <Input
                            type="date"
                            value={item.next_due_date}
                            onChange={(e) => onEdit(group.petId, item.key, 'next_due_date', e.target.value)}
                            onClick={(e) => e.stopPropagation()}
                            className="h-9 text-sm"
                          />
                        </div>
                      </div>
                      <Input
                        value={item.administered_by}
                        onChange={(e) => onEdit(group.petId, item.key, 'administered_by', e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        className="h-9 text-sm"
                        placeholder="Administered by (vet/clinic)"
                      />
                    </div>
                  </label>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </BottomSheet>
  );
}
