import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { entities } from '@/api/entities';
import { ArrowLeft, Plus, X, UtensilsCrossed, Zap, Heart, Activity, Droplets, Droplet, Scale, AlertTriangle, Pill, AlertCircle, ClipboardList } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import SymptomLogForm from '../components/SymptomLogForm';
import IconButton from '../components/IconButton';
import PageTransition from '../components/PageTransition';
import { PALETTE } from '@/lib/toneColors';
import { Z } from '@/lib/zIndex';
import useFocusTrap from '@/hooks/useFocusTrap';

function Chip({ icon: Icon, label, danger = false }) {
  return (
    <span
      className="inline-flex items-center gap-1 text-[13px] rounded-full px-2 py-0.5"
      style={danger
        ? { color: PALETTE.red, background: 'rgba(229,115,115,0.15)' }
        : { color: 'var(--text-secondary)', background: 'rgba(169,174,181,0.15)' }}
    >
      {Icon && <Icon className="h-3 w-3" />}
      {label}
    </span>
  );
}

export default function PetSymptoms() {
  const { petId } = useParams();
  const navigate = useNavigate();
  const [pet, setPet] = useState(null);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [logOpen, setLogOpen] = useState(false);
  const dialogRef = useRef(null);
  useFocusTrap(dialogRef, () => setLogOpen(false), logOpen);

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
          className="sticky z-20 bg-background/80 backdrop-blur-xl border-b border-white/8 px-4 py-3 flex items-center justify-between"
          style={{ top: 'var(--account-banner-height, 0px)', paddingTop: 'calc(env(safe-area-inset-top) + 12px)' }}
        >
          <IconButton icon={ArrowLeft} onClick={() => navigate(-1)} aria-label="Back" />
          <h1 className="text-[28px] font-semibold text-white">Symptom Timeline</h1>
          <IconButton icon={Plus} onClick={() => setLogOpen(true)} aria-label="Log symptoms" iconClassName="" iconColor={PALETTE.teal} />
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <div className="w-7 h-7 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
          </div>
        ) : logs.length === 0 ? (
          <div className="text-center py-24 px-6">
            <div className="mx-auto mb-4 w-16 h-16 rounded-full flex items-center justify-center bg-white/6">
              <ClipboardList className="h-7 w-7 text-tier-tertiary" />
            </div>
            <h2 className="text-2xl font-semibold text-white mb-1">No logs yet</h2>
            <p className="text-base text-tier-tertiary mb-6 max-w-xs mx-auto">
              Start tracking daily symptoms to build a timeline you can review and share with your vet.
            </p>
            <button
              onClick={() => setLogOpen(true)}
              className="inline-flex items-center gap-2 rounded-2xl px-5 h-12 font-semibold text-sm"
              style={{ background: PALETTE.teal, color: 'hsl(var(--background))' }}
            >
              <Plus className="h-4 w-4" /> Log symptoms
            </button>
          </div>
        ) : (
          <div className="max-w-2xl mx-auto px-4 py-5">
            {Object.entries(groups).map(([month, monthLogs]) => (
              <div key={month} className="mb-6">
                <p className="text-[13px] font-bold uppercase tracking-widest text-tier-tertiary mb-3 px-1">{month}</p>
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
                            style={{ background: PALETTE.teal, boxShadow: '0 0 8px rgba(76,199,176,0.5)' }}
                          />
                          <div
                            className="rounded-2xl p-4 bg-card border border-border"
                          >
                            <div className="flex items-baseline gap-2 mb-3">
                              <p className="text-sm font-bold text-white">{d}</p>
                              <p className="text-[13px] text-tier-tertiary">{weekday}</p>
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
                            {log.notes && <p className="text-base text-tier-tertiary mt-3 italic">{log.notes}</p>}
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

      {/* Log overlay — portaled to document.body (spec 0059), not rendered
          inline inside this page's own <PageTransition>: Framer Motion gives
          that wrapper a CSS transform even at rest, which breaks this
          panel's `fixed inset-0` viewport-anchoring once the page has been
          scrolled (same mechanism already fixed for BottomSheet/CatchUpFlow/
          OnboardingShell). Also carries the same role="dialog"/focus-trap
          treatment those three already have, via the shared useFocusTrap
          hook. */}
      {logOpen && createPortal((
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-label="Log Symptoms"
          className={`fixed inset-0 ${Z.overlay} bg-background overflow-y-auto`}
        >
          <div
            className="sticky z-10 bg-background border-b border-white/8 px-4 py-3 flex items-center justify-between"
            style={{ top: 'var(--account-banner-height, 0px)', paddingTop: 'calc(env(safe-area-inset-top) + 12px)' }}
          >
            <h2 className="font-bold text-2xl text-white">Log Symptoms</h2>
            <IconButton icon={X} onClick={() => setLogOpen(false)} aria-label="Close" />
          </div>
          <div className="px-4 py-5 pb-32 max-w-2xl mx-auto">
            <SymptomLogForm
              petId={petId}
              onOptimisticUpdate={() => {}}
              onSuccess={() => { setLogOpen(false); load(); }}
            />
          </div>
        </div>
      ), document.body)}
    </PageTransition>
  );
}