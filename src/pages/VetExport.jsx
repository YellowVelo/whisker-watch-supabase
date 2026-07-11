import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { entities } from '@/api/entities';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { ArrowLeft, Menu, FileDown, PawPrint } from 'lucide-react';
import CareMenu from '@/components/CareMenu';
import { downloadVetReport } from '@/lib/checkin/vetReportClient';

// Vet Export Feature Spec v2 §4.2 — this page does not fetch report data
// itself. It only fetches minimal pet identity for display; the actual
// report (observations, wellness scores, bloodwork, etc.) is assembled
// server-side by the generate-vet-report Edge Function and returned as a
// PDF blob for the browser to download. See VetExport's previous
// implementation (client-side fetch + window.print()) in git history —
// this replaces that entirely, per spec.
export default function VetExport() {
  const { petId } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [careOpen, setCareOpen] = useState(false);
  const [pet, setPet] = useState(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    if (!petId || petId === ':petId') return;
    entities.Pet.get(petId)
      .then(setPet)
      .catch(() => setPet(null))
      .finally(() => setLoading(false));
  }, [petId]);

  const handleDownload = async () => {
    setDownloading(true);
    try {
      await downloadVetReport(petId, pet?.name);
    } catch (err) {
      toast({ variant: 'destructive', description: err.message || 'Could not generate the vet report.' });
    } finally {
      setDownloading(false);
    }
  };

  if (loading) return <div className="fixed inset-0 flex items-center justify-center"><div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" /></div>;
  if (!pet) return <div className="text-center py-20"><p className="text-muted-foreground">Pet not found.</p></div>;

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b border-border bg-card/50 px-4 py-3 flex items-center justify-between sticky z-10" style={{ top: 'var(--account-banner-height, 0px)' }}>
        <button onClick={() => navigate(-1)} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-4 w-4" /> Back
        </button>
        <button onClick={() => setCareOpen(true)} className="h-9 w-9 rounded-full bg-secondary flex items-center justify-center">
          <Menu className="h-5 w-5" />
        </button>
      </div>
      <CareMenu open={careOpen} onOpenChange={setCareOpen} petId={petId} petName={pet?.name} />

      <div className="max-w-lg mx-auto px-6 py-10">
        <div className="flex items-center gap-3 mb-6">
          {pet.photo_url ? (
            <img src={pet.photo_url} alt={pet.name} className="w-14 h-14 rounded-full object-cover" />
          ) : (
            <div className="w-14 h-14 rounded-full bg-secondary flex items-center justify-center">
              <PawPrint className="h-6 w-6 text-muted-foreground" />
            </div>
          )}
          <div>
            <h1 className="font-serif text-2xl font-bold">{pet.name}</h1>
            {pet.breed && <p className="text-sm text-muted-foreground">{pet.breed}</p>}
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-6">
          <h2 className="font-serif text-lg font-semibold mb-1.5">Vet Report</h2>
          <p className="text-sm text-muted-foreground mb-5">
            Generate a clinic-ready PDF with {pet.name}'s wellness history, observations, medications, vaccinations, diet, weight trend, and bloodwork.
          </p>
          <Button onClick={handleDownload} disabled={downloading} className="w-full">
            <FileDown className="h-4 w-4 mr-1.5" />
            {downloading ? 'Generating…' : 'Download Report'}
          </Button>
        </div>
      </div>
    </div>
  );
}
