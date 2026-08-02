import { useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import IconButton from '../components/IconButton';
import PageTransition from '../components/PageTransition';
import { getTermsOfServiceSection, TOS_LAST_UPDATED, TOS_LAST_UPDATED_SECTION } from '@/lib/termsOfServiceContent';
import { BodyBlock } from '../components/legalContentBlocks';

// Detail screen for a single Terms of Service section, reached by tapping a
// row on the Terms of Service list (Terms.jsx). One route/component for all
// sections since they share the same paragraph/bullet-list body shape.

export default function TermsOfServiceSection() {
  const navigate = useNavigate();
  const { sectionId } = useParams();
  const section = getTermsOfServiceSection(sectionId);

  return (
    <PageTransition>
      <div className="min-h-screen pb-24">
        <header style={{ paddingTop: 'env(safe-area-inset-top)' }}>
          <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-3">
            <IconButton icon={ChevronLeft} onClick={() => navigate(-1)} aria-label="Back" />
            <h1 className="text-[24px] font-semibold truncate">{section ? section.title : 'Terms of Service'}</h1>
          </div>
        </header>

        <main className="max-w-2xl mx-auto px-4 py-2">
          {section ? (
            <>
              {section.id !== TOS_LAST_UPDATED_SECTION.id && (
                <p className="text-[13px] text-tier-tertiary mb-5">Last updated {TOS_LAST_UPDATED}</p>
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
