import { useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import PageTransition from '../components/PageTransition';
import { getTermsOfServiceSection, TOS_LAST_UPDATED, TOS_LAST_UPDATED_SECTION } from '@/lib/termsOfServiceContent';

// Renders a body link: mailto: links stay in-tab, external http(s) links
// open in a new tab (leaving the app while reading legal text shouldn't
// lose the user's place). Mirrors PrivacyPolicySection.jsx's BodyLink.
function BodyLink({ href, text }) {
  const isExternal = href.startsWith('http');
  return (
    <a
      href={href}
      className="text-primary underline underline-offset-2"
      {...(isExternal ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
    >
      {text}
    </a>
  );
}

// Detail screen for a single Terms of Service section, reached by tapping a
// row on the Terms of Service list (Terms.jsx). One route/component for all
// sections since they share the same paragraph/bullet-list body shape.
function BodyBlock({ block }) {
  if (block.type === 'paragraph') {
    return <p className="text-base text-white/70 leading-relaxed">{block.text}</p>;
  }
  if (block.type === 'subheading') {
    return <h2 className="text-[17px] font-semibold text-white mt-2">{block.text}</h2>;
  }
  if (block.type === 'link') {
    return <p className="text-base leading-relaxed"><BodyLink href={block.href} text={block.text} /></p>;
  }
  if (block.type === 'bullets') {
    return (
      <ul className="space-y-3">
        {block.items.map((item, i) => (
          <li key={i} className="text-base text-white/70 leading-relaxed flex gap-2">
            <span className="text-primary flex-shrink-0" aria-hidden="true">•</span>
            <span>
              {item.label && <span className="font-semibold text-white">{item.label}. </span>}
              {item.text}
              {item.link && <> <BodyLink href={item.link.href} text={item.link.text} />.</>}
            </span>
          </li>
        ))}
      </ul>
    );
  }
  return null;
}

export default function TermsOfServiceSection() {
  const navigate = useNavigate();
  const { sectionId } = useParams();
  const section = getTermsOfServiceSection(sectionId);

  return (
    <PageTransition>
      <div className="min-h-screen pb-24">
        <header style={{ paddingTop: 'env(safe-area-inset-top)' }}>
          <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-3">
            <button onClick={() => navigate(-1)} aria-label="Back" className="h-9 w-9 rounded-full bg-white/8 flex items-center justify-center flex-shrink-0">
              <ChevronLeft className="h-5 w-5 text-white" />
            </button>
            <h1 className="font-serif text-[24px] truncate">{section ? section.title : 'Terms of Service'}</h1>
          </div>
        </header>

        <main className="max-w-2xl mx-auto px-4 py-2">
          {section ? (
            <>
              {section.id !== TOS_LAST_UPDATED_SECTION.id && (
                <p className="text-[13px] text-white/40 mb-5">Last updated {TOS_LAST_UPDATED}</p>
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
