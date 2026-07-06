import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { entities } from '@/api/entities';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Printer, Menu } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import CareMenu from '@/components/CareMenu';
import { loadObservationCatalog } from '@/lib/checkin/checkinClient';

const LBS_TO_KG = 0.453592;

const qualityColor = { Normal: '#16a34a', Soft: '#ca8a04', Loose: '#ea580c', Watery: '#dc2626', Bloody: '#991b1b', Constipated: '#d97706', None: '#6b7280' };

export default function VetExport() {
  const { petId } = useParams();
  const [careOpen, setCareOpen] = useState(false);
  const [pet, setPet] = useState(null);
  const [logs, setLogs] = useState([]);
  const [meds, setMeds] = useState([]);
  const [foods, setFoods] = useState([]);
  const [vaccinations, setVaccinations] = useState([]);
  const [weightObservations, setWeightObservations] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!petId || petId === ':petId') return;
    Promise.all([
      entities.Pet.get(petId),
      entities.SymptomLog.filter({ pet_id: petId }, '-date', 200),
      entities.Medication.filter({ pet_id: petId }, '-start_date'),
      entities.FoodLog.filter({ pet_id: petId }, '-date', 100),
      entities.Vaccination.filter({ pet_id: petId }, '-date_given'),
      entities.Observation.filter({ pet_id: petId }, '-observed_at', 200),
      loadObservationCatalog(),
    ]).then(([c, l, m, f, v, obs, catalog]) => {
      setPet(c); setLogs(l); setMeds(m); setFoods(f); setVaccinations(v);
      // Daily Check-In weight entries are stored in lbs (see
      // src/components/DailyCheckInSheet.jsx) — the vet report converts
      // to kg for display, per vet-facing convention, while the app
      // itself always shows lbs to the owner.
      const weightTypeId = catalog.weight?.type.id;
      setWeightObservations(obs.filter((o) => o.observation_type_id === weightTypeId && o.numeric_value != null));
      setLoading(false);
    });
  }, [petId]);

  if (loading) return <div className="fixed inset-0 flex items-center justify-center"><div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" /></div>;
  if (!pet) return <div className="text-center py-20"><p className="text-muted-foreground">Pet not found.</p></div>;

  const sortedLogs = [...logs].sort((a, b) => b.date.localeCompare(a.date));
  const activeMeds = meds.filter(m => m.active);
  const foodSummary = foods.reduce((acc, f) => {
    const key = `${f.food_name}${f.brand ? ` (${f.brand})` : ''}`;
    if (!acc[key]) acc[key] = { type: f.food_type, reactions: new Set(), count: 0 };
    acc[key].count++;
    if (f.reaction) acc[key].reactions.add(f.reaction);
    return acc;
  }, {});

  return (
    <div className="min-h-screen bg-background">
      {/* Print toolbar - hidden when printing */}
      <div className="no-print border-b border-border bg-card/50 px-4 py-3 flex items-center justify-between sticky z-10" style={{ top: 'var(--account-banner-height, 0px)' }}>
        <Link to={`/pet/${petId}`} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-4 w-4" /> Back
        </Link>
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={() => window.print()}>
            <Printer className="h-4 w-4 mr-1.5" /> Print / Save PDF
          </Button>
          <button onClick={() => setCareOpen(true)} className="h-9 w-9 rounded-full bg-secondary flex items-center justify-center">
            <Menu className="h-5 w-5" />
          </button>
        </div>
      </div>
      <CareMenu open={careOpen} onOpenChange={setCareOpen} petId={petId} petName={pet?.name} />

      {/* Printable report */}
      <div className="max-w-3xl mx-auto px-6 py-8 print:px-8 print:py-6">
        {/* Header */}
        <div className="mb-6 pb-4 border-b-2 border-foreground">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="font-serif text-3xl font-bold">{pet.name}</h1>
              {pet.breed && <p className="text-muted-foreground">{pet.breed}</p>}
              {pet.birth_date && <p className="text-sm text-muted-foreground">Born: {format(parseISO(pet.birth_date), 'MMMM d, yyyy')}</p>}
            </div>
            <div className="text-right text-sm text-muted-foreground">
              <p>Generated: {format(new Date(), 'MMMM d, yyyy')}</p>
              <p>Records: {logs.length} symptom logs</p>
            </div>
          </div>
          {pet.conditions?.length > 0 && (
            <div className="mt-3 flex gap-2 flex-wrap">
              <span className="text-sm font-semibold">Conditions:</span>
              {pet.conditions.map(c => <span key={c} className="text-sm bg-secondary px-2 py-0.5 rounded">{c}</span>)}
            </div>
          )}
        </div>

        {/* Vaccinations */}
        {vaccinations.length > 0 && (
          <section className="mb-6">
            <h2 className="font-serif text-xl font-semibold mb-3 border-b border-border pb-1">Vaccination Records</h2>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted-foreground border-b border-border">
                  <th className="pb-1.5 font-medium">Vaccine</th>
                  <th className="pb-1.5 font-medium">Date Given</th>
                  <th className="pb-1.5 font-medium">Next Due</th>
                  <th className="pb-1.5 font-medium">Administered By</th>
                  <th className="pb-1.5 font-medium">Lot #</th>
                </tr>
              </thead>
              <tbody>
                {vaccinations.map(v => (
                  <tr key={v.id} className="border-b border-border/50">
                    <td className="py-1.5 font-medium">{v.vaccine_name}</td>
                    <td className="py-1.5">{v.date_given ? format(parseISO(v.date_given), 'MMM d, yyyy') : '—'}</td>
                    <td className="py-1.5">{v.next_due_date ? format(parseISO(v.next_due_date), 'MMM d, yyyy') : '—'}</td>
                    <td className="py-1.5">{v.administered_by || '—'}</td>
                    <td className="py-1.5">{v.lot_number || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {/* Active Medications */}
        {activeMeds.length > 0 && (
          <section className="mb-6">
            <h2 className="font-serif text-xl font-semibold mb-3 border-b border-border pb-1">Current Medications</h2>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted-foreground border-b border-border">
                  <th className="pb-1.5 font-medium">Medication</th>
                  <th className="pb-1.5 font-medium">Dosage</th>
                  <th className="pb-1.5 font-medium">Frequency</th>
                  <th className="pb-1.5 font-medium">Route</th>
                  <th className="pb-1.5 font-medium">Since</th>
                </tr>
              </thead>
              <tbody>
                {activeMeds.map(m => (
                  <tr key={m.id} className="border-b border-border/50">
                    <td className="py-1.5 font-medium">{m.name}</td>
                    <td className="py-1.5">{m.dosage || '—'}</td>
                    <td className="py-1.5">{m.frequency || '—'}</td>
                    <td className="py-1.5">{m.route || '—'}</td>
                    <td className="py-1.5">{m.start_date ? format(parseISO(m.start_date), 'MMM d, yyyy') : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {/* Foods */}
        {Object.keys(foodSummary).length > 0 && (
          <section className="mb-6">
            <h2 className="font-serif text-xl font-semibold mb-3 border-b border-border pb-1">Diet</h2>
            <div className="flex flex-wrap gap-2">
              {Object.entries(foodSummary).map(([name, info]) => (
                <div key={name} className="border border-border rounded px-2.5 py-1.5 text-sm">
                  <span className="font-medium">{name}</span>
                  {info.type && <span className="text-muted-foreground"> · {info.type}</span>}
                  {info.reactions.size > 0 && <span className="text-muted-foreground"> · {[...info.reactions].join(', ')}</span>}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Symptom Log Table */}
        {sortedLogs.length > 0 && (
          <section className="mb-6">
            <h2 className="font-serif text-xl font-semibold mb-3 border-b border-border pb-1">Symptom History ({sortedLogs.length} records)</h2>
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-muted-foreground border-b border-border">
                  <th className="pb-1.5 font-medium">Date</th>
                  <th className="pb-1.5 font-medium">Appetite</th>
                  <th className="pb-1.5 font-medium">Energy</th>
                  <th className="pb-1.5 font-medium">Stool</th>
                  <th className="pb-1.5 font-medium">Vomit</th>
                  <th className="pb-1.5 font-medium">Water</th>
                  <th className="pb-1.5 font-medium">Weight</th>
                  <th className="pb-1.5 font-medium">Flags</th>
                </tr>
              </thead>
              <tbody>
                {sortedLogs.map(log => (
                  <tr key={log.id} className="border-b border-border/30">
                    <td className="py-1">{format(parseISO(log.date), 'MM/dd/yy')}</td>
                    <td className="py-1">{log.appetite || '—'}</td>
                    <td className="py-1">{log.energy_level || '—'}</td>
                    <td className="py-1" style={{ color: qualityColor[log.stool_quality] || 'inherit' }}>{log.stool_quality || '—'}</td>
                    <td className="py-1">{log.vomiting > 0 ? <span style={{ color: '#dc2626', fontWeight: 600 }}>{log.vomiting}x</span> : '0'}</td>
                    <td className="py-1">{log.water_intake || '—'}</td>
                    <td className="py-1">{log.weight_grams ? `${(log.weight_grams * 0.00220462).toFixed(1)} lbs / ${(log.weight_grams / 1000).toFixed(2)} kg` : '—'}</td>
                    <td className="py-1">
                      {log.pain_signs && <span style={{ color: '#dc2626' }}>Pain </span>}
                      {log.medication_given && <span style={{ color: '#0d9488' }}>Meds </span>}
                      {log.nausea_symptoms?.length > 0 && <span style={{ color: '#9333ea' }}>Nausea</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {sortedLogs.some(l => l.notes) && (
              <div className="mt-4 space-y-1.5">
                <h3 className="text-sm font-semibold text-muted-foreground">Notes</h3>
                {sortedLogs.filter(l => l.notes).map(log => (
                  <p key={log.id} className="text-xs"><span className="font-medium">{format(parseISO(log.date), 'MM/dd/yy')}:</span> {log.notes}</p>
                ))}
              </div>
            )}
          </section>
        )}

        {/* Daily Check-In Weight Log — entered in lbs by the owner, shown in kg here for the vet */}
        {weightObservations.length > 0 && (
          <section className="mb-6">
            <h2 className="font-serif text-xl font-semibold mb-3 border-b border-border pb-1">Weight Log ({weightObservations.length} records)</h2>
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-muted-foreground border-b border-border">
                  <th className="pb-1.5 font-medium">Date</th>
                  <th className="pb-1.5 font-medium">Weight (kg)</th>
                  <th className="pb-1.5 font-medium">Weight (lbs)</th>
                </tr>
              </thead>
              <tbody>
                {weightObservations.map((o) => (
                  <tr key={o.id} className="border-b border-border/30">
                    <td className="py-1">{format(parseISO(o.observed_at), 'MM/dd/yy')}</td>
                    <td className="py-1">{(o.numeric_value * LBS_TO_KG).toFixed(2)} kg</td>
                    <td className="py-1 text-muted-foreground">{o.numeric_value.toFixed(1)} lbs</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        <p className="text-xs text-muted-foreground text-center mt-8 pt-4 border-t border-border">
          Generated by Wysker Watch · {format(new Date(), 'MMMM d, yyyy')}
        </p>
      </div>

      <style>{`@media print { .no-print { display: none !important; } body { background: white; } }`}</style>
    </div>
  );
}