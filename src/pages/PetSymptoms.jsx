import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { entities } from '@/api/entities';
import { ArrowLeft, Plus, X, UtensilsCrossed, Zap, Heart, Activity, Droplets, Droplet, Scale, AlertTriangle, Pill, AlertCircle, ClipboardList } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import SymptomLogForm from '../components/SymptomLogForm';
import PageTransition from '../components/PageTransition';

function Chip({ icon: Icon, label, danger }) {
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs rounded-full px-2 py-0.5 ${danger ? 'text-red-400 border border-red-500/20' : 'text-white/60 border border-white/10'}`}
      style={{ background: danger ? 'rgba(239,68,68,0.1)' : 'rgba(255,255,255,0.06)' }}
    >
      {Icon && <Icon className="h-3 w-3" />}
      {label}
    </span>
  );
}

export default function PetSymptoms() {
  const { petId } = useParams();
  const [pet, setPet] = useState(null);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [logOpen, setLogOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [p, l] = await Promise.all([
      entities.Pet.get(petId),
      entities.SymptomLog.filter({ pet_id: petId }, '-date', 500),
    ]);
    setPet(p);
    setLogs(l);
    setLoading(false);
  }, [petId]);

  useEffect(() => { load(); }, [load]);

  // Group logs by month for the timeline
  const groups = {};
  for (const log of logs) {
    const m = format(parseISO(log.date), 'MMMM yyyy');
    (groups[m] ||= []).push(log);
  }

  return (
    <PageTransition>
      <div className="min-h-screen bg-background pb-28">
        {/* Header */}
        <div
          className="sticky top-0 z-20 bg-background/80 backdrop-blur-xl border-b border-white/8 px-4 py-3 flex items-center justify-between"
          style={{ paddingTop: 'calc(env(safe-area-inset-top) + 12px)' }}
        >
          <Link to={`/pet/${petId}`} className="w-9 h-9 rounded-full flex items-center justify-center bg-white/8">
            <ArrowLeft className="h-5 w-5 text-white" />
          </Link>
          <h1 className="text-base font-semibold text-white">Symptom Timeline</h1>
          <button
            onClick={() => setLogOpen(true)}
            className="w-9 h-9 rounded-full flex items-center justify-center"
            style={{ background: 'rgba(0,212,170,0.15)' }}
          >
            <Plus className="h-5 w-5" style={{ color: '#00D4AA' }} />
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <div className="w-7 h-7 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
          </div>
        ) : logs.length === 0 ? (
          <div className="text-center py-24 px-6">
            <div className="mx-auto mb-4 w-16 h-16 rounded-full flex items-center justify-center bg-white/6">
              <ClipboardList className="h-7 w-7 text-white/40" />
            </div>
            <h2 className="text-lg font-semibold text-white mb-1">No logs yet</h2>
            <p className="text-sm text-white/40 mb-6 max-w-xs mx-auto">
              Start tracking daily symptoms to build a timeline you can review and share with your vet.
            </p>
            <button
              onClick={() => setLogOpen(true)}
              className="inline-flex items-center gap-2 rounded-2xl px-5 h-12 font-semibold text-sm"
              style={{ background: '#00D4AA', color: '#0D0F1A' }}
            >
              <Plus className="h-4 w-4" /> Log symptoms
            </button>
          </div>
        ) : (
          <div className="max-w-2xl mx-auto px-4 py-5">
            {Object.entries(groups).map(([month, monthLogs]) => (
              <div key={month} className="mb-6">
                <p className="text-xs font-bold uppercase tracking-widest text-white/30 mb-3 px-1">{month}</p>
                <div className="relative pl-6">
                  <div className="absolute left-[7px] top-1 bottom-1 w-px bg-white/10" />
                  <div className="space-y-3">
                    {monthLogs.map(log => {
                      const d = format(parseISO(log.date), 'MMM d');
                      const weekday = format(parseISO(log.date), 'EEE');
                      return (
                        <div key={log.id} className="relative">
                          <div
                            className="absolute -left-6 top-3.5 w-3.5 h-3.5 rounded-full"
                            style={{ background: '#00D4AA', boxShadow: '0 0 8px rgba(0,212,170,0.5)' }}
                          />
                          <div
                            className="rounded-2xl p-4"
                            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}
                          >
                            <div className="flex items-baseline gap-2 mb-3">
                              <p className="text-sm font-bold text-white">{d}</p>
                              <p className="text-xs text-white/30">{weekday}</p>
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                              {log.appetite && <Chip icon={UtensilsCrossed} label={log.appetite} />}
                              {log.energy_level && <Chip icon={Zap} label={log.energy_level} />}
                              {log.vomiting > 0 && <Chip icon={Heart} label={`×${log.vomiting}`} danger />}
                              {log.stool_quality && log.stool_quality !== 'None' && <Chip icon={Activity} label={log.stool_quality} />}
                              {log.water_intake && log.water_intake !== 'Not observed' && <Chip icon={Droplets} label={log.water_intake} />}
                              {log.urination && log.urination !== 'None' && <Chip icon={Droplet} label={log.urination} />}
                              {log.weight_grams != null && <Chip icon={Scale} label={`${(log.weight_grams / 1000).toFixed(2)} kg`} />}
                              {log.pain_signs && <Chip icon={AlertTriangle} label="Pain" danger />}
                              {log.medication_given && <Chip icon={Pill} label="Meds given" />}
                              {log.nausea_symptoms?.length > 0 && <Chip icon={AlertCircle} label={`Nausea: ${log.nausea_symptoms.join(', ')}`} danger />}
                            </div>
                            {log.notes && <p className="text-xs text-white/50 mt-3 italic">{log.notes}</p>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Log overlay */}
      {logOpen && (
        <div className="fixed inset-0 z-50 bg-background overflow-y-auto">
          <div
            className="sticky top-0 z-10 bg-background border-b border-white/8 px-4 py-3 flex items-center justify-between"
            style={{ paddingTop: 'calc(env(safe-area-inset-top) + 12px)' }}
          >
            <h2 className="font-bold text-xl text-white">Log Symptoms</h2>
            <button onClick={() => setLogOpen(false)} className="h-9 w-9 rounded-full bg-white/8 flex items-center justify-center">
              <X className="h-4 w-4 text-white" />
            </button>
          </div>
          <div className="px-4 py-5 pb-32 max-w-2xl mx-auto">
            <SymptomLogForm
              petId={petId}
              onOptimisticUpdate={() => {}}
              onSuccess={() => { setLogOpen(false); load(); }}
            />
          </div>
        </div>
      )}
    </PageTransition>
  );
}