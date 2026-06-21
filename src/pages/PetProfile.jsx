import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { entities } from '@/api/entities';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft, Plus, FileText, X, Rainbow } from 'lucide-react';
import { getPetEmoji } from '@/lib/speciesConfig';
import SymptomLogForm from '../components/SymptomLogForm';
import EditPetSheet from '../components/EditPetSheet';
import MemorialDialog from '../components/MemorialDialog';
import SymptomTrends from '../components/SymptomTrends';
import LogHistory from '../components/LogHistory';
import MedicationSection from '../components/MedicationSection';
import FoodSection from '../components/FoodSection';
import BloodworkSection from '../components/BloodworkSection';
import PetSittingSection from '../components/PetSittingSection';
import VaccinationSection from '../components/VaccinationSection';
import PetAIInsights from '../components/PetAIInsights';
import PetAIChat from '../components/PetAIChat';
import ExportCalendarButton from '../components/ExportCalendarButton';
import PageTransition from '../components/PageTransition';
import usePullToRefresh from '../hooks/usePullToRefresh';
import PullToRefreshIndicator from '../components/PullToRefreshIndicator';

const conditionColors = {
  IBD: 'bg-amber-100 text-amber-800', CKD: 'bg-blue-100 text-blue-800',
  Diabetes: 'bg-purple-100 text-purple-800', Hyperthyroidism: 'bg-rose-100 text-rose-800',
  Pancreatitis: 'bg-orange-100 text-orange-800', 'Liver Disease': 'bg-green-100 text-green-800',
  Other: 'bg-gray-100 text-gray-800',
};

export default function PetProfile() {
  const { petId } = useParams();
  const [pet, setPet] = useState(null);
  const [logs, setLogs] = useState([]);
  const [medications, setMedications] = useState([]);
  const [bloodwork, setBloodwork] = useState([]);
  const [loading, setLoading] = useState(true);
  const [aiTab, setAiTab] = useState('insights');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [memorialOpen, setMemorialOpen] = useState(false);
  const isMemorial = pet?.is_memorial;

  const loadData = useCallback(async () => {
    setLoading(true);
    const [petData, logData, medData, bwData] = await Promise.all([
      entities.Pet.get(petId),
      entities.SymptomLog.filter({ pet_id: petId }, '-date', 200),
      entities.Medication.filter({ pet_id: petId }, '-start_date', 50),
      entities.Bloodwork.filter({ pet_id: petId }, '-date', 20),
    ]);
    setPet(petData);
    setLogs(logData);
    setMedications(medData);
    setBloodwork(bwData);
    setLoading(false);
  }, [petId]);

  useEffect(() => { if (petId && petId !== ':petId') loadData(); }, [petId, loadData]);

  const { isPulling, pullDistance, isRefreshing } = usePullToRefresh(loadData);

  if (loading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (!pet) {
    return (
      <div className="text-center py-20">
        <p className="text-muted-foreground">Pet not found.</p>
        <Link to="/" className="text-primary underline text-sm mt-2 block">Go back</Link>
      </div>
    );
  }

  return (
    <PageTransition>
    <div className="min-h-screen pb-28">
      <PullToRefreshIndicator pullDistance={pullDistance} isRefreshing={isRefreshing} />
      {/* Hero header */}
      <header className="relative overflow-hidden" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        {pet.photo_url && (
          <div className="absolute inset-0">
            <img src={pet.photo_url} alt={pet.name} className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-black/20 to-black/60" />
          </div>
        )}
        {!pet.photo_url && (
          <div className="absolute inset-0 bg-gradient-to-br from-primary/20 via-accent/10 to-secondary" />
        )}
        <div className="relative px-4 py-4 flex items-start justify-between">
          <Link to="/" className="h-9 w-9 rounded-full bg-black/20 backdrop-blur-sm flex items-center justify-center text-white hover:bg-black/30 transition-colors">
            <ArrowLeft className="h-5 w-5" />
          </Link>
        </div>
        <div className="relative px-5 pt-2 pb-6">
          {!pet.photo_url && (
            <div className="h-20 w-20 rounded-full bg-primary/20 flex items-center justify-center mb-3 border-2 border-primary/30">
              <span className="text-4xl">{getPetEmoji(pet.species)}</span>
            </div>
          )}
          <h1 className={`font-serif text-4xl ${pet.photo_url ? 'text-white drop-shadow' : 'text-foreground'}`}>{pet.name}</h1>
          {pet.breed && <p className={`text-sm mt-0.5 ${pet.photo_url ? 'text-white/80' : 'text-muted-foreground'}`}>{pet.breed}</p>}
          {pet.nicknames?.length > 0 && (
            <p className={`text-xs mt-0.5 italic ${pet.photo_url ? 'text-white/70' : 'text-muted-foreground'}`}>
              also known as {pet.nicknames.join(', ')}
            </p>
          )}
          <div className="flex flex-wrap gap-1.5 mt-2">
            {pet.conditions?.map(c => (
              <span key={c} className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                pet.photo_url ? 'bg-white/20 text-white backdrop-blur-sm' : (conditionColors[c] || conditionColors.Other)
              }`}>{c}</span>
            ))}
          </div>
          {/* Action buttons — bottom-left of hero */}
          <div className="flex gap-2 mt-3 flex-wrap">
            <button onClick={() => setEditOpen(true)} className="inline-flex items-center gap-1.5 text-xs text-white/90 bg-black/20 backdrop-blur-sm hover:bg-black/30 border border-white/20 rounded-full px-3 py-1.5 transition-colors">
              ✏️ Edit
            </button>
            <Link to={`/pet/${petId}/export`} className="inline-flex items-center gap-1.5 text-xs text-white/90 bg-black/20 backdrop-blur-sm hover:bg-black/30 border border-white/20 rounded-full px-3 py-1.5 transition-colors">
              <FileText className="h-3.5 w-3.5" /> Vet Report
            </Link>
            <ExportCalendarButton petId={petId} petName={pet.name} iconOnly />


            {!pet.is_memorial && (
              <button
                onClick={() => setSheetOpen(true)}
                className="inline-flex items-center gap-1.5 text-xs text-white bg-primary/80 backdrop-blur-sm hover:bg-primary border border-primary/40 rounded-full px-3 py-1.5 transition-colors">
                <Plus className="h-3.5 w-3.5" /> Log
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-5">
        {pet.favorite_activities?.length > 0 && (
          <div className="mb-4 p-3.5 bg-card rounded-2xl border border-border">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Favorite Activities</p>
            <div className="flex flex-wrap gap-1.5">
              {pet.favorite_activities.map(a => (
                <span key={a} className="text-xs bg-primary/10 text-primary px-2.5 py-1 rounded-full">{a}</span>
              ))}
            </div>
          </div>
        )}
        <Tabs defaultValue="history" className="w-full">
          {/* Two-row scrollable tab bar */}
          <div className="space-y-1.5 mb-5">
            <TabsList className="w-full grid grid-cols-3 h-11 rounded-2xl">
              <TabsTrigger value="history" className="rounded-xl text-sm">📋 History</TabsTrigger>
              <TabsTrigger value="trends" className="rounded-xl text-sm">📈 Trends</TabsTrigger>
              <TabsTrigger value="medications" className="rounded-xl text-sm">💊 Meds</TabsTrigger>
            </TabsList>
            <TabsList className="w-full grid grid-cols-5 h-11 rounded-2xl">
              <TabsTrigger value="food" className="rounded-xl text-xs">🍽 Food</TabsTrigger>
              <TabsTrigger value="bloodwork" className="rounded-xl text-xs">🩸 Labs</TabsTrigger>
              <TabsTrigger value="vaccines" className="rounded-xl text-xs">💉 Vaccines</TabsTrigger>
              <TabsTrigger value="petsit" className="rounded-xl text-xs">🏠 Sitter</TabsTrigger>
              <TabsTrigger value="ai" className="rounded-xl text-xs">🤖 AI</TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="history" className="mt-0">
            <div className="bg-card rounded-2xl border border-border p-4 shadow-sm">
              <LogHistory logs={logs} />
            </div>
          </TabsContent>
          <TabsContent value="trends" className="mt-0">
            <div className="bg-card rounded-2xl border border-border p-4 shadow-sm">
              <SymptomTrends logs={logs} />
            </div>
          </TabsContent>
          <TabsContent value="medications" className="mt-0">
            <div className="bg-card rounded-2xl border border-border p-4 shadow-sm">
              <MedicationSection petId={petId} />
            </div>
          </TabsContent>
          <TabsContent value="food" className="mt-0">
            <div className="bg-card rounded-2xl border border-border p-4 shadow-sm">
              <FoodSection petId={petId} />
            </div>
          </TabsContent>
          <TabsContent value="bloodwork" className="mt-0">
            <div className="bg-card rounded-2xl border border-border p-4 shadow-sm">
              <BloodworkSection petId={petId} />
            </div>
          </TabsContent>
          <TabsContent value="vaccines" className="mt-0">
            <div className="bg-card rounded-2xl border border-border p-4 shadow-sm">
              <VaccinationSection petId={petId} species={pet?.species} />
            </div>
          </TabsContent>
          <TabsContent value="petsit" className="mt-0">
            <div className="bg-card rounded-2xl border border-border p-4 shadow-sm">
              <PetSittingSection petId={petId} />
            </div>
          </TabsContent>
          <TabsContent value="ai" className="mt-0">
            <div className="bg-card rounded-2xl border border-border p-4 shadow-sm">
              <div className="flex gap-2 mb-4">
                <button
                  onClick={() => setAiTab('insights')}
                  className={`flex-1 py-2 rounded-xl text-sm font-medium transition-colors ${
                    aiTab === 'insights' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'
                  }`}
                >✨ Insights</button>
                <button
                  onClick={() => setAiTab('chat')}
                  className={`flex-1 py-2 rounded-xl text-sm font-medium transition-colors ${
                    aiTab === 'chat' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'
                  }`}
                >💬 Ask a Question</button>
              </div>
              {aiTab === 'insights'
                ? <PetAIInsights pet={pet} logs={logs} medications={medications} bloodwork={bloodwork} />
                : <PetAIChat pet={pet} medications={medications} />
              }
            </div>
          </TabsContent>
        </Tabs>

        {!pet.is_memorial && (
          <div className="mt-8 pt-6 border-t border-border/50">
            <button
              onClick={() => setMemorialOpen(true)}
              className="w-full flex items-center gap-3 px-4 py-3.5 bg-card border border-border rounded-xl text-left hover:bg-purple-50 hover:border-purple-200 transition-colors text-purple-700"
            >
              <span className="text-lg">🌈</span>
              <div>
                <p className="text-sm font-medium">Crossed the Rainbow Bridge</p>
                <p className="text-xs text-muted-foreground">Convert to a memorial profile</p>
              </div>
            </button>
          </div>
        )}

        {pet.is_memorial && (
          <div className="mt-8 pt-6 border-t border-border/50">
            <div className="px-4 py-4 bg-purple-50 border border-purple-200 rounded-xl text-center">
              <p className="text-2xl mb-1">🌈</p>
              <p className="text-sm font-medium text-purple-800">Forever in our hearts</p>
              {pet.memorial_date && <p className="text-xs text-purple-600 mt-0.5">{new Date(pet.memorial_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>}
            </div>
          </div>
        )}
      </main>

      {sheetOpen && (
        <div className="fixed inset-0 z-50 bg-background overflow-y-auto">
          <div className="sticky top-0 z-10 bg-background border-b border-border px-4 py-3 flex items-center justify-between" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 12px)' }}>
            <h2 className="font-serif text-xl">Log Symptoms</h2>
            <button onClick={() => setSheetOpen(false)} className="h-9 w-9 rounded-full bg-secondary flex items-center justify-center">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="px-4 py-5 pb-32">
            <SymptomLogForm
              petId={petId}
              onOptimisticUpdate={(tempLog) => {
                setLogs(prev => [tempLog, ...prev]);
                setSheetOpen(false);
              }}
              onSuccess={loadData}
            />
          </div>
        </div>
      )}
      <EditPetSheet pet={pet} open={editOpen} onOpenChange={setEditOpen} onSuccess={loadData} />
      <MemorialDialog pet={pet} open={memorialOpen} onOpenChange={setMemorialOpen} onSuccess={loadData} />
    </div>
    </PageTransition>
  );
}
