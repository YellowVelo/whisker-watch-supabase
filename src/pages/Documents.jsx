import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Folder } from 'lucide-react';
import PageTransition from '@/components/PageTransition';

export default function Documents() {
  const { petId } = useParams();
  const navigate = useNavigate();

  return (
    <PageTransition>
      <div className="min-h-screen bg-background pb-28">
        <header
          className="sticky top-0 z-10 bg-background/90 backdrop-blur border-b border-border"
          style={{ paddingTop: 'env(safe-area-inset-top)' }}
        >
          <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
            <button onClick={() => navigate(-1)} className="h-9 w-9 rounded-full bg-secondary flex items-center justify-center">
              <ArrowLeft className="h-5 w-5" />
            </button>
            <h1 className="font-serif text-2xl">Documents</h1>
          </div>
        </header>
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