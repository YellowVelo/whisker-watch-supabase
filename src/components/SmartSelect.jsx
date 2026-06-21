import { useState } from 'react';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Check } from 'lucide-react';

const isMobile = () => window.innerWidth < 768 || /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

export default function SmartSelect({ value, onValueChange, placeholder = 'Select...', options = [] }) {
  const [open, setOpen] = useState(false);

  if (!isMobile()) {
    return (
      <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger><SelectValue placeholder={placeholder} /></SelectTrigger>
        <SelectContent>
          {options.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
        </SelectContent>
      </Select>
    );
  }

  // Mobile: Vaul bottom-sheet drawer
  const displayValue = value || placeholder;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full flex items-center justify-between rounded-lg border border-input bg-background px-3 py-2 text-sm min-h-[44px] text-left"
      >
        <span className={value ? 'text-foreground' : 'text-muted-foreground'}>{displayValue}</span>
        <svg className="h-4 w-4 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle className="font-serif text-lg">{placeholder}</DrawerTitle>
          </DrawerHeader>
          <div className="px-4 pb-6" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 1.5rem)' }}>
            {options.map(o => (
              <button
                key={o}
                type="button"
                onClick={() => { onValueChange(o); setOpen(false); }}
                className={`w-full flex items-center justify-between px-4 py-3.5 rounded-xl mb-1.5 text-sm transition-colors min-h-[52px] ${
                  value === o
                    ? 'bg-primary text-primary-foreground font-medium'
                    : 'bg-secondary text-foreground hover:bg-secondary/70'
                }`}
              >
                {o}
                {value === o && <Check className="h-4 w-4" />}
              </button>
            ))}
          </div>
        </DrawerContent>
      </Drawer>
    </>
  );
}