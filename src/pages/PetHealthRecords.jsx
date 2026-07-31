import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import BloodworkSection from '../components/BloodworkSection';
import IconButton from '../components/IconButton';
import PageTransition from '../components/PageTransition';

export default function PetHealthRecords() {
  const { petId } = useParams();
  const navigate = useNavigate();
  return (
    <PageTransition>
      <div className="min-h-screen bg-background pb-28">
        <div
          className="sticky z-20 bg-background/80 backdrop-blur-xl border-b border-white/8 px-4 py-3 flex items-center gap-3"
          style={{ top: 'var(--account-banner-height, 0px)', paddingTop: 'calc(env(safe-area-inset-top) + 12px)' }}
        >
          <IconButton icon={ArrowLeft} onClick={() => navigate(-1)} aria-label="Back" />
          <h1 className="text-[28px] font-semibold text-white">Health Records</h1>
        </div>
        <div className="max-w-2xl mx-auto px-4 py-5">
          <BloodworkSection petId={petId} />
        </div>
      </div>
    </PageTransition>
  );
}
