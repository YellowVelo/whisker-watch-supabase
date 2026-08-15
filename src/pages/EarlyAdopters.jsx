import { useState } from 'react';
import { Loader2, MailCheck } from 'lucide-react';
import { supabase } from '@/api/supabaseClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import PageTransition from '@/components/PageTransition';
import Turnstile from '@/components/Turnstile';

// Public Early Adopters welcome page (spec 0056) — reachable at
// /early-adopters, no account, no login. Distinct from /beta (spec 0053,
// which screens people to test the rough Alpha app right now): this page
// is for general social traffic who just want to know when the real app
// is ready. This is the pre-PWA-launch list; a separate "Watch List"
// (pre-App-Store phase) is a later, not-yet-built concept.
//
// Deliberately leads with the problem it solves, not a signup pitch —
// written for someone arriving fresh from a social post, not someone who
// already knows the product. No mention of the Vibe check-in model,
// symptom-count logic, or any other internal mechanics, same rule /beta
// follows.
export default function EarlyAdopters() {
  const [firstName, setFirstName] = useState('');
  const [email, setEmail] = useState('');
  const [consent, setConsent] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const canSubmit = firstName.trim() && email.trim() && consent && turnstileToken && !loading;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!firstName.trim()) {
      setError('First name is required.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('Please enter a valid email address.');
      return;
    }
    if (!consent) {
      setError('Please check the box to join the Early Adopters list.');
      return;
    }
    if (!turnstileToken) {
      setError('Please complete the verification check above.');
      return;
    }
    setLoading(true);
    setError('');
    const { error: invokeError } = await supabase.functions.invoke('early-adopter-signup', {
      body: {
        first_name: firstName.trim(),
        email: email.trim(),
        consent: true,
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
    setSuccess(true);
  };

  return (
    <PageTransition>
      <div className="min-h-screen bg-background pb-24">
        <main className="max-w-2xl mx-auto px-4 py-10 space-y-12">
          {/* Hero — leads with the problem, not a pitch */}
          <section className="text-center space-y-4">
            <h1 className="text-[28px] sm:text-[32px] font-bold leading-tight text-foreground">
              "Has he been better or worse lately?" And you're just... guessing.
            </h1>
            <p className="text-[16px] sm:text-[18px] text-muted-foreground">
              If your cat or dog has an ongoing health thing, you're probably tracking it in your head, a notes app,
              or a spreadsheet that goes stale in a week. Wysker Watch is a simple daily check-in built to fix that —
              and it's almost ready.
            </p>
          </section>

          {/* Problem */}
          <section className="space-y-3">
            <h2 className="text-[22px] font-semibold text-foreground">Sound familiar?</h2>
            <p className="text-[16px] text-muted-foreground leading-relaxed">
              The 2am symptom-Googling. The vet visit where you're trying to remember if the limp started Tuesday or
              last week. The gut feeling that something's "off" with no way to prove it, or disprove it. None of
              that is a memory problem — it's a tracking problem.
            </p>
          </section>

          {/* Solution */}
          <section className="space-y-3">
            <h2 className="text-[22px] font-semibold text-foreground">What we're building</h2>
            <p className="text-[16px] text-muted-foreground leading-relaxed">
              An honest daily read on whether today was a Great day, an Off day, or a Tough one, plus any symptoms
              worth noting — no numeric scores to overthink. Over time, you get a real picture instead of a guess.
              We're still finishing it up, so it's not open for sign-ups quite yet.
            </p>
          </section>

          {/* Early Adopters capture */}
          <section id="early-adopters" className="scroll-mt-8">
            <div className="rounded-2xl bg-card border border-border p-6 sm:p-8 space-y-5">
              {success ? (
                <div className="text-center space-y-3 py-4">
                  <MailCheck className="h-10 w-10 text-primary mx-auto" aria-hidden="true" />
                  <h2 className="text-[20px] font-semibold text-foreground">You're on the list</h2>
                  <p className="text-[15px] text-muted-foreground">
                    Check your email for confirmation — we'll send you an invite the moment Wysker Watch is ready to
                    sign up.
                  </p>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-5">
                  <div className="text-center space-y-1">
                    <h2 className="text-[20px] font-semibold text-foreground">Want to know the moment it's ready?</h2>
                    <p className="text-[14px] text-muted-foreground">Join the Early Adopters list — no account, no commitment.</p>
                  </div>

                  {error && <p className="text-[15px] text-destructive text-center">{error}</p>}

                  <div className="space-y-1.5">
                    <Label htmlFor="ea-first-name">First Name</Label>
                    <Input
                      id="ea-first-name"
                      type="text"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      maxLength={200}
                      required
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="ea-email">Email</Label>
                    <Input
                      id="ea-email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                    />
                  </div>

                  <label htmlFor="ea-consent" className="flex items-start gap-3 min-h-11 py-1 cursor-pointer">
                    <Checkbox
                      id="ea-consent"
                      checked={consent}
                      onCheckedChange={(checked) => setConsent(checked === true)}
                      className="mt-0.5"
                    />
                    <span className="text-sm text-muted-foreground">
                      <span className="text-foreground font-medium">Yes! I'm Adopting Early</span> — you'll get an
                      email invite the moment Wysker Watch is ready to sign up.
                    </span>
                  </label>

                  <Turnstile
                    onVerify={setTurnstileToken}
                    onExpire={() => setTurnstileToken('')}
                    onError={() => setTurnstileToken('')}
                  />

                  <Button type="submit" className="w-full" disabled={!canSubmit}>
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Join the Early Adopters List'}
                  </Button>
                </form>
              )}
            </div>
          </section>
        </main>
      </div>
    </PageTransition>
  );
}
