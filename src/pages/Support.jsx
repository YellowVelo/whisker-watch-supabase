import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Mail } from 'lucide-react';
import IconButton from '../components/IconButton';
import PageTransition from '../components/PageTransition';
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '../components/ui/accordion';
import { BodyLink } from '../components/legalContentBlocks';

// Spec 0051 — FAQ + contact-email content, replacing the earlier
// "coming soon" placeholder (Menu Feature Spec #3) now that help
// content is specced. FAQ_ITEMS is plain data on purpose: the answer
// text is expected to be edited over time without touching layout code.
const FAQ_ITEMS = [
  {
    question: 'What is Wysker Watch?',
    answer: "Wysker Watch helps you keep track of your cat or dog's day-to-day health and wellbeing in one place — quick daily check-ins, a timeline for medications, vaccinations, vet visits, and more, all in one app.",
  },
  {
    question: 'How does the daily check-in work?',
    answer: 'Each day you tell us how your pet\'s day went — Great, Off, Tough, or you can skip. Separately, if you log any symptoms that day, we show whether that count is trending up, down, or steady compared to yesterday. These two things are tracked separately on purpose — a "tough day" doesn\'t require a symptom, and a symptom doesn\'t automatically mean a bad day.',
  },
  {
    question: "Can I share a pet's profile with someone else, like a partner or family member?",
    answer: "Yes — you can invite a co-owner by email from the pet's profile. A co-owner has full access to view, log, and edit that pet's information, the same as you.",
  },
  {
    question: 'Can I give a pet sitter temporary access?',
    answer: "Yes — there's a separate, more limited \"invite a sitter\" option that gives someone access while you're away, without giving them full co-owner permissions.",
  },
  {
    question: 'Is Wysker Watch a replacement for my veterinarian?',
    answer: 'No. Wysker Watch is a tracking and organization tool, not a medical device, diagnostic tool, or substitute for professional veterinary care. Always contact your vet (or an emergency vet) for anything urgent or concerning.',
  },
  {
    question: 'Can I delete my account?',
    answer: "Yes — this is available in Settings, and it's a permanent action that removes your account and data. You'll be asked to confirm before it happens.",
  },
  {
    question: 'I found a bug or something looks wrong — what should I do during the Alpha test?',
    answer: 'Please email us at support@wyskerwatch.com with what you were doing, what you expected, and what happened instead — screenshots help a lot.',
  },
  {
    question: 'How do I contact support?',
    answer: "Email support@wyskerwatch.com and we'll get back to you.",
  },
];

export default function Support() {
  const navigate = useNavigate();
  return (
    <PageTransition>
      <div className="min-h-screen pb-24">
        <header style={{ paddingTop: 'env(safe-area-inset-top)' }}>
          <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-3">
            <IconButton icon={ChevronLeft} onClick={() => navigate(-1)} aria-label="Back" />
            <h1 className="text-[28px] font-semibold">Support</h1>
          </div>
        </header>
        <main className="max-w-2xl mx-auto px-4 py-6 space-y-8">
          <section>
            <h2 className="text-[13px] font-semibold text-tier-tertiary uppercase tracking-wide mb-3 px-1">
              Frequently Asked Questions
            </h2>
            <div className="rounded-2xl bg-card border border-border px-4">
              <Accordion type="multiple">
                {FAQ_ITEMS.map((item) => (
                  <AccordionItem key={item.question} value={item.question}>
                    <AccordionTrigger>{item.question}</AccordionTrigger>
                    <AccordionContent>{item.answer}</AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </div>
          </section>

          <section>
            <h2 className="text-[13px] font-semibold text-tier-tertiary uppercase tracking-wide mb-3 px-1">
              Contact Us
            </h2>
            <div className="rounded-2xl bg-card border border-border px-4 py-4 flex items-center gap-3.5">
              <div
                className="h-11 w-11 rounded-full flex items-center justify-center flex-shrink-0"
                style={{ background: 'rgba(125,211,252,0.14)' }}
              >
                <Mail className="h-5 w-5 text-sky-300" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <p className="text-[16px] font-semibold text-white">Email support</p>
                <p className="text-[15px]">
                  <BodyLink href="mailto:support@wyskerwatch.com" text="support@wyskerwatch.com" />
                </p>
              </div>
            </div>
          </section>
        </main>
      </div>
    </PageTransition>
  );
}
