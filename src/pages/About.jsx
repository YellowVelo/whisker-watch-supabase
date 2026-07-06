import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Heart } from 'lucide-react';
import PageTransition from '@/components/PageTransition';

export default function About() {
  const navigate = useNavigate();

  return (
    <PageTransition>
      <div className="min-h-screen bg-background pb-28">
        <header
          className="sticky z-10 bg-background/90 backdrop-blur border-b border-border"
          style={{ top: 'var(--account-banner-height, 0px)', paddingTop: 'env(safe-area-inset-top)' }}
        >
          <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
            <button onClick={() => navigate(-1)} className="h-9 w-9 rounded-full bg-secondary flex items-center justify-center">
              <ArrowLeft className="h-5 w-5" />
            </button>
            <h1 className="font-serif text-2xl">About</h1>
          </div>
        </header>
        <div className="max-w-2xl mx-auto px-4 py-10">
          <div className="text-center mb-8">
            <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
              <Heart className="h-8 w-8 text-primary" />
            </div>
            <h2 className="font-serif text-3xl mb-2">Wysker Watch</h2>
            <p className="text-sm text-muted-foreground max-w-sm mx-auto">
              Track daily symptoms for your cats and dogs with chronic conditions. Spot patterns and share insights with your vet.
            </p>
          </div>
          <div className="space-y-4 text-sm text-muted-foreground">
            <p>
              Wysker Watch helps pet parents caring for animals with chronic conditions like IBD, CKD, diabetes, and hyperthyroidism.
              Log appetite, energy, symptoms, and weight daily to visualize trends and catch flare-ups early.
            </p>
            <p>
              Share a complete picture with your vet through exportable reports, and keep pet sitters informed with detailed care instructions.
            </p>
          </div>
        </div>
      </div>
    </PageTransition>
  );
}