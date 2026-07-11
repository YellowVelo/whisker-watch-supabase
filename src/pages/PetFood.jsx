import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import FoodSection from '../components/FoodSection';
import PageTransition from '../components/PageTransition';

export default function PetFood() {
  const { petId } = useParams();
  const navigate = useNavigate();
  return (
    <PageTransition>
      <div className="min-h-screen bg-background pb-28">
        <div
          className="sticky z-20 bg-background/80 backdrop-blur-xl border-b border-white/8 px-4 py-3 flex items-center gap-3"
          style={{ top: 'var(--account-banner-height, 0px)', paddingTop: 'calc(env(safe-area-inset-top) + 12px)' }}
        >
          <button onClick={() => navigate(-1)} aria-label="Back" className="w-9 h-9 rounded-full flex items-center justify-center bg-white/8">
            <ArrowLeft className="h-5 w-5 text-white" />
          </button>
          <h1 className="text-[28px] font-semibold text-white">Food History</h1>
        </div>
        <div className="max-w-2xl mx-auto px-4 py-5">
          <FoodSection petId={petId} />
        </div>
      </div>
    </PageTransition>
  );
}
