import { useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import IconButton from '../components/IconButton';
import PageTransition from '../components/PageTransition';
import { getPrivacyPolicySection, PRIVACY_POLICY_LAST_UPDATED, PRIVACY_POLICY_LAST_UPDATED_SECTION } from '@/lib/privacyPolicyContent';
import { BodyBlock } from '../components/legalContentBlocks';

// Detail screen for a single Privacy Policy section, reached by tapping a
// row on the Privacy Policy list (Privacy.jsx). One route/component for
// all sections since they share the same paragraph/bullet-list body shape.

export default function PrivacyPolicySection() {
  const navigate = useNavigate();
  const { sectionId } = useParams();
  const section = getPrivacyPolicySection(sectionId);

  return (
    <PageTransition>
      <div className="min-h-screen pb-24">
        <header style={{ paddingTop: 'env(safe-area-inset-top)' }}>
          <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-3">
            <IconButton icon={ChevronLeft} onClick={() => navigate(-1)} aria-label="Back" />
            <h1 className="text-[24px] font-semibold truncate">{section ? section.title : 'Privacy Policy'}</h1>
          </div>
        </header>

        <main className="max-w-2xl mx-auto px-4 py-2">
          {section ? (
            <>
              {section.id !== PRIVACY_POLICY_LAST_UPDATED_SECTION.id && (
                <p className="text-[13px] text-tier-tertiary mb-5">Last updated {PRIVACY_POLICY_LAST_UPDATED}</p>
              )}
              <div className="space-y-4">
                {section.body.map((block, i) => (
                  <BodyBlock key={i} block={block} />
                ))}
              </div>
            </>
          ) : (
            <p className="text-base text-muted-foreground py-16 text-center">Section not found.</p>
          )}
        </main>
      </div>
    </PageTransition>
  );
}
