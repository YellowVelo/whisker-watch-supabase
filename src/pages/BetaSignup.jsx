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

// Public beta-signup landing page + screener (spec 0053) — separate from
// the rest of the app, reachable with no account and no login. Copy is
// finalized (see the spec) and deliberately says nothing about the Vibe
// check-in model, symptom-count logic, or any other internal mechanics —
// this page is meant to be linked from Reddit/BetaList to people who've
// never used the app and don't know Lynn personally, so it stays generic
// on how the product actually works under the hood.
//
// Flow: email step (no network call) -> screener step (4 questions,
// CAPTCHA-gated) -> a single call to the beta-signup Edge Function stores
// everything at once. See beta-signup/index.ts for the server side.

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
  const [step, setStep] = useState('email'); // 'email' | 'screener' | 'success'
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState('');

  const [conditionStatus, setConditionStatus] = useState('');
  const [trackingMethod, setTrackingMethod] = useState('');
  const [frustration, setFrustration] = useState('');
  const [betaComfort, setBetaComfort] = useState('');
  const [turnstileToken, setTurnstileToken] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleEmailSubmit = (e) => {
    e.preventDefault();
    const trimmed = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setEmailError('Please enter a valid email address.');
      return;
    }
    setEmailError('');
    setEmail(trimmed);
    setStep('screener');
  };

  const screenerComplete = conditionStatus && trackingMethod && frustration.trim() && betaComfort;

  const handleScreenerSubmit = async (e) => {
    e.preventDefault();
    if (!screenerComplete) {
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
        email,
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
          {/* Hero */}
          <section className="text-center space-y-4">
            <h1 className="text-[28px] sm:text-[32px] font-bold leading-tight text-foreground">
              Finally know if your pet is actually doing better — or you're just hoping.
            </h1>
            <p className="text-[16px] sm:text-[18px] text-muted-foreground">
              Wysker Watch helps you track how your cat or dog is really doing, day to day — so you walk into every
              vet visit with real answers, not guesses.
            </p>
            <Button
              size="lg"
              className="mt-2"
              onClick={() => document.getElementById('signup')?.scrollIntoView({ behavior: 'smooth' })}
            >
              Get Early Access
            </Button>
          </section>

          {/* Problem */}
          <section className="space-y-3">
            <h2 className="text-[22px] font-semibold text-foreground">The Problem</h2>
            <p className="text-[16px] text-muted-foreground leading-relaxed">
              If your pet has an ongoing health issue, you're probably tracking it in your head, a notes app, or a
              spreadsheet that gets stale in a week. When the vet asks "has it gotten better since we changed the
              medication?" — you're guessing.
            </p>
          </section>

          {/* Solution */}
          <section className="space-y-3">
            <h2 className="text-[22px] font-semibold text-foreground">The Solution</h2>
            <p className="text-[16px] text-muted-foreground leading-relaxed">
              Wysker Watch is a simple daily check-in. No numeric scores to overthink — just an honest read on
              whether today was a Great day, an Off day, or a Tough one, plus any symptoms worth noting. Over time,
              you get a real picture instead of a memory.
            </p>
          </section>

          {/* Who it's for */}
          <section className="space-y-3">
            <h2 className="text-[22px] font-semibold text-foreground">Who it's for</h2>
            <ul className="space-y-2 text-[16px] text-muted-foreground leading-relaxed list-disc pl-5">
              <li>Pets with chronic or ongoing conditions (kidney disease, allergies, mobility issues, anxiety, seizures, etc.)</li>
              <li>Owners who want to track something but don't want a clinical spreadsheet</li>
              <li>Anyone who's ever sat in a vet appointment thinking "I honestly don't know if it's been better or worse lately"</li>
            </ul>
          </section>

          {/* Email + screener */}
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
              ) : step === 'screener' ? (
                <form onSubmit={handleScreenerSubmit} className="space-y-6">
                  <div className="text-center space-y-1">
                    <h2 className="text-[20px] font-semibold text-foreground">A couple quick questions</h2>
                    <p className="text-[14px] text-muted-foreground">Just enough to make sure it's a good fit — takes under a minute.</p>
                  </div>

                  {error && <p className="text-[15px] text-destructive text-center">{error}</p>}

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

                  <Button type="submit" className="w-full" disabled={loading || !screenerComplete || !turnstileToken}>
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Submit'}
                  </Button>
                </form>
              ) : (
                <form onSubmit={handleEmailSubmit} className="space-y-4">
                  <div className="text-center space-y-1">
                    <h2 className="text-[20px] font-semibold text-foreground">Get Early Access</h2>
                    <p className="text-[14px] text-muted-foreground">
                      We're testing with a small group before opening this up. Sign up below — we'll reach out
                      personally with access and a couple quick questions to make sure it's a good fit.
                    </p>
                  </div>
                  {emailError && <p className="text-[15px] text-destructive text-center">{emailError}</p>}
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
                  <Button type="submit" className="w-full">Submit</Button>
                  <p className="text-[13px] text-muted-foreground text-center">
                    No spam, no data sale. You'll hear from us directly, not a mailing list.
                  </p>
                </form>
              )}
            </div>
          </section>
        </main>
      </div>
    </PageTransition>
  );
}
