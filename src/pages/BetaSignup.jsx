import { useState } from 'react';
import { Loader2, MailCheck } from 'lucide-react';
import { supabase } from '@/api/supabaseClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import PillToggle from '@/components/PillToggle';
import PageTransition from '@/components/PageTransition';
import Turnstile from '@/components/Turnstile';

// Public beta-signup landing page + screener (spec 0053, v2). Separate from
// the rest of the app, reachable with no account and no login. Copy is
// finalized (see the spec) and deliberately says nothing about the Vibe
// check-in model, symptom-count logic, or any other internal mechanics —
// this page is meant to be linked from Reddit/BetaList to people who've
// never used the app and don't know Lynn personally, so it stays generic
// on how the product actually works under the hood.
//
// Flow (v2 — collapsed from v1's two-step email-then-screener flow after
// Lynn reviewed the live page): the hero's "Get Early Access" button is the
// only thing visible at first. Clicking it reveals, in place on the same
// page, one form with the email field AND all 4 screener questions
// together. One submit -> a single call to the beta-signup Edge Function
// stores everything at once. See beta-signup/index.ts for the server side,
// which is unchanged by this flow simplification.

const CONDITION_STATUS_OPTIONS = [
  { value: 'diagnosed', label: 'Yes, diagnosed condition' },
  { value: 'watching_closely', label: 'Not diagnosed, but I watch them closely' },
  { value: 'just_curious', label: 'No, just curious about the app' },
];

const TRACKING_METHOD_OPTIONS = [
  { value: 'none', label: "I don't, really" },
  { value: 'notes_app', label: 'Notes app / memory' },
  { value: 'spreadsheet', label: 'Spreadsheet' },
  { value: 'another_app', label: 'Another app' },
  { value: 'paper_notebook', label: 'Paper notebook' },
];

const BETA_COMFORT_OPTIONS = [
  { value: 'yes', label: 'Yes' },
  { value: 'prefer_to_wait', label: 'Prefer to wait for a more polished version' },
];

function SingleSelectQuestion({ label, options, value, onChange }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="flex flex-col gap-2">
        {options.map((opt) => (
          <PillToggle
            key={opt.value}
            active={value === opt.value}
            onClick={() => onChange(opt.value)}
            className="justify-start rounded-2xl px-4 py-3 text-left text-[15px]"
          >
            <span className="truncate">{opt.label}</span>
          </PillToggle>
        ))}
      </div>
    </div>
  );
}

export default function BetaSignup() {
  const [step, setStep] = useState('hero'); // 'hero' | 'form' | 'success'
  const [email, setEmail] = useState('');

  const [conditionStatus, setConditionStatus] = useState('');
  const [trackingMethod, setTrackingMethod] = useState('');
  const [frustration, setFrustration] = useState('');
  const [betaComfort, setBetaComfort] = useState('');
  const [turnstileToken, setTurnstileToken] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const formComplete = email.trim() && conditionStatus && trackingMethod && frustration.trim() && betaComfort;

  const handleSubmit = async (e) => {
    e.preventDefault();
    const trimmedEmail = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setError('Please enter a valid email address.');
      return;
    }
    if (!conditionStatus || !trackingMethod || !frustration.trim() || !betaComfort) {
      setError('Please answer all 4 questions.');
      return;
    }
    if (!turnstileToken) {
      setError('Please complete the verification check above.');
      return;
    }
    setLoading(true);
    setError('');
    const { error: invokeError } = await supabase.functions.invoke('beta-signup', {
      body: {
        email: trimmedEmail,
        condition_status: conditionStatus,
        tracking_method: trackingMethod,
        frustration: frustration.trim(),
        beta_comfort: betaComfort,
        turnstile_token: turnstileToken,
      },
    });
    if (invokeError) {
      const serverMessage = await invokeError?.context?.json?.().then((b) => b?.error).catch(() => null);
      setError(serverMessage || 'Something went wrong. Please try again.');
      setLoading(false);
      return;
    }
    setLoading(false);
    setStep('success');
  };

  return (
    <PageTransition>
      <div className="min-h-screen bg-background pb-24">
        <main className="max-w-2xl mx-auto px-4 py-10 space-y-12">
          {/* Hero — brand-voice rewrite, replacing the earlier "you're guessing" /
              "Great day, Off day, Tough one" copy, which read as anxiety-inducing
              and leaked internal Vibe-model terminology. Sarcasm here is aimed at
              the owner's own anxious habits (2am Googling, hyper-observing their
              pet), never at the pet's health or the owner's competence — matches
              CLAUDE.md's locked brand-voice rule. */}
          <section className="text-center space-y-4">
            <h1 className="text-[28px] sm:text-[32px] font-bold leading-tight text-foreground">
              Another pet health tracker?
              <br />
              We know. We rolled our eyes too.
            </h1>
            <p className="text-[18px] sm:text-[20px] font-semibold text-foreground">
              So we built Wysker Watch.
            </p>
            <p className="text-[16px] sm:text-[18px] text-muted-foreground">
              It's for people who know exactly how many bites of breakfast their cat left behind, can hear a
              suspicious noise from three rooms away, and have absolutely Googled something unhinged at 2:13 AM.
            </p>
            <p className="text-[16px] sm:text-[18px] font-medium text-foreground">
              You know your pet.
            </p>
            <p className="text-[16px] sm:text-[18px] text-muted-foreground">
              We're building something that makes all that paying attention actually useful — without turning you
              into their unpaid medical records department.
            </p>
            {step === 'hero' && (
              <Button size="lg" className="mt-2" onClick={() => setStep('form')}>
                Get Early Access
              </Button>
            )}
          </section>

          {/* Combined email + screener form, revealed only after the hero
              button is clicked (spec 0053 v2) — no separate email-only step,
              no intro heading/paragraph, same URL throughout. */}
          {step !== 'hero' && (
            <section id="signup" className="scroll-mt-8">
              <div className="rounded-2xl bg-card border border-border p-6 sm:p-8 space-y-5">
                {step === 'success' ? (
                  <div className="text-center space-y-3 py-4">
                    <MailCheck className="h-10 w-10 text-primary mx-auto" aria-hidden="true" />
                    <h2 className="text-[20px] font-semibold text-foreground">You're on the list</h2>
                    <p className="text-[15px] text-muted-foreground">
                      Thanks for signing up. Check your email for confirmation — we'll reach out personally if it's a
                      good fit for our first round of testing.
                    </p>
                  </div>
                ) : (
                  <form onSubmit={handleSubmit} className="space-y-6">
                    {error && <p className="text-[15px] text-destructive text-center">{error}</p>}

                    <div className="space-y-1.5">
                      <Label htmlFor="beta-email">Email</Label>
                      <Input
                        id="beta-email"
                        type="text"
                        inputMode="email"
                        autoComplete="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="you@example.com"
                      />
                    </div>

                    <SingleSelectQuestion
                      label="Do you currently have a cat or dog with an ongoing health condition, or one you're keeping a close eye on?"
                      options={CONDITION_STATUS_OPTIONS}
                      value={conditionStatus}
                      onChange={setConditionStatus}
                    />

                    <SingleSelectQuestion
                      label="How do you currently track your pet's health day to day?"
                      options={TRACKING_METHOD_OPTIONS}
                      value={trackingMethod}
                      onChange={setTrackingMethod}
                    />

                    <div className="space-y-1.5">
                      <Label htmlFor="beta-frustration">What's the most frustrating part of managing your pet's health right now?</Label>
                      <Textarea
                        id="beta-frustration"
                        value={frustration}
                        onChange={(e) => setFrustration(e.target.value)}
                        maxLength={2000}
                        rows={3}
                        required
                      />
                    </div>

                    <SingleSelectQuestion
                      label="Are you comfortable using a very early, occasionally rough beta app in exchange for early access and a direct line to shape the product?"
                      options={BETA_COMFORT_OPTIONS}
                      value={betaComfort}
                      onChange={setBetaComfort}
                    />

                    <Turnstile
                      onVerify={setTurnstileToken}
                      onExpire={() => setTurnstileToken('')}
                      onError={() => setTurnstileToken('')}
                    />

                    <Button type="submit" className="w-full" disabled={loading || !formComplete || !turnstileToken}>
                      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Submit'}
                    </Button>
                    <p className="text-[13px] text-muted-foreground text-center">
                      No spam, no data sale. You'll hear from us directly, not a mailing list.
                    </p>
                  </form>
                )}
              </div>
            </section>
          )}
        </main>
      </div>
    </PageTransition>
  );
}
