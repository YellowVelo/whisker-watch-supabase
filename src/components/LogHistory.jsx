import { format, parseISO } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, Pill, Droplets } from 'lucide-react';

const qualityColor = {
  Normal: 'text-green-600', Soft: 'text-yellow-600', Loose: 'text-orange-600',
  Watery: 'text-red-600', Bloody: 'text-red-700', Constipated: 'text-orange-500', None: 'text-muted-foreground',
};

export default function LogHistory({ logs }) {
  if (!logs.length) {
    return <p className="text-center text-muted-foreground text-sm py-6">No logs yet. Start tracking today!</p>;
  }

  const sorted = [...logs].sort((a, b) => b.date.localeCompare(a.date));

  return (
    <div className="space-y-3">
      {sorted.map(log => (
        <div key={log.id} className="bg-card border border-border rounded-lg p-4 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">{format(parseISO(log.date), 'EEE, MMM d yyyy')}</span>
            <div className="flex gap-1.5">
              {log.pain_signs && (
                <span className="flex items-center gap-1 text-xs text-destructive">
                  <AlertTriangle className="h-3 w-3" /> Pain
                </span>
              )}
              {log.medication_given && (
                <span className="flex items-center gap-1 text-xs text-primary">
                  <Pill className="h-3 w-3" /> Meds
                </span>
              )}
            </div>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            {log.appetite && <span>Appetite: <strong className="text-foreground">{log.appetite}</strong></span>}
            {log.energy_level && <span>Energy: <strong className="text-foreground">{log.energy_level}</strong></span>}
            {log.stool_quality && <span>Stool: <strong className={qualityColor[log.stool_quality] || ''}>{log.stool_quality}</strong></span>}
            {log.water_intake && <span>Water: <strong className="text-foreground">{log.water_intake}</strong></span>}
            {log.urination && <span>Urination: <strong className="text-foreground">{log.urination}</strong></span>}
            {log.vomiting > 0 && <span>Vomiting: <strong className="text-destructive">{log.vomiting}x</strong></span>}
            {log.weight_grams && <span>Weight: <strong className="text-foreground">{(log.weight_grams / 453.592).toFixed(2)} lbs</strong></span>}
          </div>
          {log.nausea_symptoms?.length > 0 && (
            <p className="text-xs text-muted-foreground">Nausea: <span className="text-foreground">{log.nausea_symptoms.join(', ')}</span></p>
          )}
          {log.notes && <p className="text-xs text-muted-foreground italic">{log.notes}</p>}
        </div>
      ))}
    </div>
  );
}