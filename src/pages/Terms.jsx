import { Link, useNavigate } from 'react-router-dom';
import {
  ChevronLeft, ChevronRight, FileText, Calendar,
  Info, Stethoscope, Sparkles, User, Server, Scale, Mail,
} from 'lucide-react';
import PageTransition from '../components/PageTransition';
import { TOS_LAST_UPDATED, TOS_SECTIONS } from '@/lib/termsOfServiceContent';

// Menu -> Terms of Service: lists every section of terms-of-service.md, each
// row navigating to its own detail screen (see TermsOfServiceSection.jsx).
// UI matches the "Privacy Policy" screenshot exactly (same screen, different
// content) — flat icons (no icon-circle background), unlike MenuListRow's
// Settings-screen rows.
const SECTION_ICONS = { Info, Stethoscope, Sparkles, User, Server, Scale, FileText, Mail };

export default function Terms() {
  const navigate = useNavigate();

  return (
    <PageTransition>
      <div className="min-h-screen pb-24">
        <header style={{ paddingTop: 'env(safe-area-inset-top)' }}>
          <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-3">
            <button onClick={() => navigate(-1)} aria-label="Back" className="h-9 w-9 rounded-full bg-white/8 flex items-center justify-center flex-shrink-0">
              <ChevronLeft className="h-5 w-5 text-white" />
            </button>
            <h1 className="font-serif text-[28px]">Terms of Service</h1>
          </div>
        </header>

        <main className="max-w-2xl mx-auto px-4 space-y-4">
          {/* Hero card */}
          <div
            className="rounded-2xl px-5 py-5 flex items-start gap-4"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
          >
            <div
              className="h-14 w-14 rounded-full flex items-center justify-center flex-shrink-0"
              style={{ background: 'rgba(111,183,255,0.10)' }}
            >
              <FileText className="h-7 w-7 text-primary" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <p className="text-[19px] font-bold text-white">Your agreement with us</p>
              <p className="text-[14px] text-white/50 mt-1 leading-snug">
                These Terms explain what Wysker Watch is, and isn't, and what you agree to by using it.
              </p>
            </div>
          </div>

          {/* Last updated */}
          <Link
            to="/terms/last-updated"
            className="rounded-2xl px-4 py-3.5 flex items-center gap-3 active:opacity-70 transition-opacity"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
          >
            <Calendar className="h-5 w-5 text-primary flex-shrink-0" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="text-[13px] text-white/45">Last updated</p>
              <p className="text-[15px] font-semibold text-white">{TOS_LAST_UPDATED}</p>
            </div>
            <ChevronRight className="h-4.5 w-4.5 text-white/20 flex-shrink-0" aria-hidden="true" />
          </Link>

          {/* Sections */}
          <div className="rounded-2xl overflow-hidden divide-y" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderColor: 'rgba(255,255,255,0.08)' }}>
            {TOS_SECTIONS.map((section) => {
              const Icon = SECTION_ICONS[section.icon];
              return (
                <Link
                  key={section.id}
                  to={`/terms/${section.id}`}
                  className="w-full flex items-center gap-3 px-4 py-3.5 text-left active:opacity-70 transition-opacity min-h-[64px]"
                >
                  <Icon className="h-5 w-5 text-primary flex-shrink-0" aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[15px] font-semibold text-white truncate">{section.title}</p>
                    <p className="text-[13px] text-white/45">{section.subtitle}</p>
                  </div>
                  <ChevronRight className="h-4.5 w-4.5 text-white/30 flex-shrink-0" aria-hidden="true" />
                </Link>
              );
            })}
          </div>
        </main>
      </div>
    </PageTransition>
  );
}
