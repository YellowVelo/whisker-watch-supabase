import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Folder, Menu } from 'lucide-react';
import PageTransition from '@/components/PageTransition';
import CareMenu from '@/components/CareMenu';

export default function Documents() {
  const { petId } = useParams();
  const navigate = useNavigate();
  const [careOpen, setCareOpen] = useState(false);

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
            <h1 className="font-serif text-2xl flex-1">Documents</h1>
            <button onClick={() => setCareOpen(true)} className="h-9 w-9 rounded-full bg-secondary flex items-center justify-center">
              <Menu className="h-5 w-5" />
            </button>
          </div>
        </header>
        <CareMenu open={careOpen} onOpenChange={setCareOpen} petId={petId} />
        <div className="max-w-2xl mx-auto px-4 py-10">
          <div className="text-center">
            <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
              <Folder className="h-8 w-8 text-primary" />
            </div>
            <h2 className="font-serif text-xl mb-1">No documents yet</h2>
            <p className="text-sm text-muted-foreground max-w-sm mx-auto">
              Store vet records, lab PDFs, adoption papers, and other important documents for your pet here.
            </p>
          </div>
        </div>
      </div>
    </PageTransition>
  );
}