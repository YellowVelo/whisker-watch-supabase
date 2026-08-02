import { useState } from 'react';
import { entities } from '@/api/entities';
import { Button } from '@/components/ui/button';
import IconButton from './IconButton';
import { CalendarDays, Loader2 } from 'lucide-react';
import { format, parseISO } from 'date-fns';

function toICSDate(dateStr) {
  // Convert YYYY-MM-DD to YYYYMMDD (all-day event)
  return dateStr.replace(/-/g, '');
}

function escapeICS(str) {
  return (str || '').replace(/[\\;,]/g, (c) => '\\' + c).replace(/\n/g, '\\n');
}

function buildICS(events) {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Wysker Watch//Pet Health//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
  ];

  events.forEach((ev) => {
    const uid = `${ev.uid}@wyskerwatch`;
    const dtstart = toICSDate(ev.date);
    // All-day event: DTEND = next day
    const dtEnd = toICSDate(
      format(new Date(parseISO(ev.date).getTime() + 86400000), 'yyyy-MM-dd')
    );
    lines.push(
      'BEGIN:VEVENT',
      `UID:${uid}`,
      `DTSTART;VALUE=DATE:${dtstart}`,
      `DTEND;VALUE=DATE:${dtEnd}`,
      `SUMMARY:${escapeICS(ev.title)}`,
      `DESCRIPTION:${escapeICS(ev.description)}`,
      'END:VEVENT'
    );
  });

  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

export default function ExportCalendarButton({ petId, petName, iconOnly = false }) {
  const [loading, setLoading] = useState(false);

  const handleExport = async () => {
    setLoading(true);
    try {
      const [meds, vaccines] = await Promise.all([
        entities.Medication.filter({ pet_id: petId }),
        entities.Vaccination.filter({ pet_id: petId }),
      ]);

      const events = [];

      // Medications with next_due_date
      meds.forEach((med) => {
        if (med.next_due_date) {
          events.push({
            uid: `med-${med.id}`,
            date: med.next_due_date,
            title: `${petName}: ${med.name} due`,
            description: [
              med.dosage && `Dosage: ${med.dosage}`,
              med.frequency && `Frequency: ${med.frequency}`,
              med.prescribing_vet && `Vet: ${med.prescribing_vet}`,
              med.notes,
            ].filter(Boolean).join('\n'),
          });
        }
      });

      // Vaccinations with next_due_date
      vaccines.forEach((vax) => {
        if (vax.next_due_date) {
          events.push({
            uid: `vax-${vax.id}`,
            date: vax.next_due_date,
            title: `${petName}: ${vax.vaccine_name} due`,
            description: [
              vax.administered_by && `Vet: ${vax.administered_by}`,
              vax.notes,
            ].filter(Boolean).join('\n'),
          });
        }
      });

      if (events.length === 0) {
        alert('No upcoming due dates found. Add next due dates to medications or vaccines first.');
        return;
      }

      const ics = buildICS(events);
      const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${petName.replace(/\s+/g, '_')}_health_calendar.ics`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setLoading(false);
    }
  };

  if (iconOnly) {
    return (
      <IconButton
        icon={loading ? Loader2 : CalendarDays}
        iconClassName={loading ? 'text-foreground animate-spin' : 'text-foreground'}
        onClick={handleExport}
        aria-label="Export to Calendar"
        disabled={loading}
      />
    );
  }

  return (
    <Button variant="outline" size="sm" onClick={handleExport} disabled={loading}>
      {loading ? (
        <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
      ) : (
        <CalendarDays className="h-4 w-4 mr-1.5" />
      )}
      Export to Calendar
    </Button>
  );
}