import { useRef } from 'react';
import { CalendarDays } from 'lucide-react';
import { Input } from '@/components/ui/input';
import IconButton from './IconButton';
import { openDatePicker } from '@/lib/sitDates';

// Spec 0088: a date box you can type into, with a separate calendar button.
// Clicking the box itself only places the cursor (so a wrong year can be
// typed over); the button beside it opens the browser's calendar. The
// browser's own calendar icon is hidden in Chrome/Edge/Safari so there is
// only one. 44px tall to match the button's tap area.
export default function DateField({ value, onChange, min = undefined, max = undefined, id = undefined, buttonLabel, className = '', ...ariaProps }) {
  const inputRef = useRef(null);

  return (
    <div className="relative">
      <Input
        ref={inputRef}
        type="date"
        id={id}
        value={value}
        min={min}
        max={max}
        onChange={onChange}
        className={`h-11 pr-11 [&::-webkit-calendar-picker-indicator]:hidden ${className}`}
        {...ariaProps}
      />
      <div className="absolute inset-y-0 right-0 flex items-center">
        <IconButton
          icon={CalendarDays}
          variant="plain"
          iconClassName="h-5 w-5 text-muted-foreground"
          aria-label={buttonLabel}
          title={buttonLabel}
          onClick={() => openDatePicker({ currentTarget: inputRef.current })}
        />
      </div>
    </div>
  );
}
