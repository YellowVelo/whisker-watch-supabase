import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, User } from 'lucide-react';
import PageTransition from '../components/PageTransition';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/lib/AuthContext';
import { entities } from '@/api/entities';
import { track } from '@/lib/analytics';
import { detectTimezone, isValidIanaTimezone, isManualTimezoneChange, listAvailableTimezones } from '@/lib/timezone';

const NAME_MAX_LENGTH = 100;

function buildFormFromProfile(profile) {
  const timezone = profile?.timezone || detectTimezone() || '';
  return {
    firstName: profile?.first_name || '',
    lastName: profile?.last_name || '',
    timezone,
    timezoneIsManual: !!profile?.timezone_is_manual,
    detectionFailed: !profile?.timezone && !timezone,
  };
}

// Owner-level identity + timezone (Menu -> Account -> Profile, User
// Profile & Timezone Settings V1). Reads/writes go through
// entities.Profile — never a direct Supabase call from this component.
export default function Account() {
  const navigate = useNavigate();
  const { user, isLoadingAuth, profileLoadError, refreshProfile } = useAuth();
  const { toast } = useToast();

  // `user` from AuthContext is not stable for the lifetime of a form
  // session — it gets a new reference on every background auth event
  // (e.g. a routine token refresh while this screen is left open), not
  // just on login/logout. The form must not resync from it whenever
  // that happens, or in-progress edits get silently discarded. Instead
  // the form initializes once per signed-in user (tracked by id) and
  // `baseline` — not `user` — is what Cancel/dirty-checking compare
  // against; it only advances after a save this component itself made.
  const initializedForUserIdRef = useRef(null);
  const [baseline, setBaseline] = useState(null);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [timezone, setTimezone] = useState('');
  const [timezoneIsManual, setTimezoneIsManual] = useState(false);
  const [detectionFailed, setDetectionFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [timezoneError, setTimezoneError] = useState('');

  const timezoneOptions = useMemo(() => listAvailableTimezones(), []);

  const applyForm = (form) => {
    setFirstName(form.firstName);
    setLastName(form.lastName);
    setTimezone(form.timezone);
    setTimezoneIsManual(form.timezoneIsManual);
    setDetectionFailed(form.detectionFailed);
  };

  useEffect(() => {
    // Skip while the profile fetch itself failed — initializing from a
    // partial/error profile would mask the "Unable to load your
    // profile" error state below. Stays uninitialized until a
    // subsequent auth event successfully loads the real profile row.
    if (!user || profileLoadError) return;
    if (initializedForUserIdRef.current === user.id) return;
    initializedForUserIdRef.current = user.id;
    const form = buildFormFromProfile(user);
    setBaseline(form);
    applyForm(form);
    setSaveError('');
    setTimezoneError('');
  }, [user, profileLoadError]);

  useEffect(() => {
    track('profile_opened', {});
  }, []);

  const isDirty = !!baseline && (
    firstName !== baseline.firstName ||
    lastName !== baseline.lastName ||
    timezone !== baseline.timezone ||
    timezoneIsManual !== baseline.timezoneIsManual
  );

  const handleTimezoneChange = (value) => {
    setTimezone(value);
    setTimezoneIsManual(true);
    setTimezoneError('');
  };

  const handleResetToAutomatic = () => {
    const detected = detectTimezone();
    setTimezoneIsManual(false);
    if (detected) {
      setTimezone(detected);
      setDetectionFailed(false);
    } else {
      setDetectionFailed(true);
    }
  };

  const handleCancel = () => {
    if (baseline) applyForm(baseline);
    setSaveError('');
    setTimezoneError('');
  };

  const handleSave = async () => {
    if (!isValidIanaTimezone(timezone)) {
      setTimezoneError('Please choose a valid timezone.');
      return;
    }
    setSaving(true);
    setSaveError('');
    const manualChange = isManualTimezoneChange({
      timezoneIsManual,
      timezone,
      previousTimezone: baseline?.timezone,
      previousTimezoneIsManual: baseline?.timezoneIsManual,
    });
    const savedForm = { firstName, lastName, timezone, timezoneIsManual, detectionFailed };

    try {
      await entities.Profile.update(user.id, {
        first_name: firstName.trim() || null,
        last_name: lastName.trim() || null,
        timezone,
        timezone_is_manual: timezoneIsManual,
      });
    } catch {
      setSaveError('Unable to save your profile. Please try again.');
      setSaving(false);
      return;
    }

    // The write above is the source of truth for "did the save
    // succeed" — a failure in the read-back below must not be reported
    // to the owner as a failed save, since their data is already
    // persisted.
    setBaseline(savedForm);
    track('profile_saved', {});
    if (manualChange) {
      track('timezone_manual_changed', { timezone });
    }
    toast({ description: 'Profile saved.' });

    try {
      await refreshProfile();
    } catch (err) {
      console.warn('Profile saved, but refreshing shared account state failed:', err);
    }

    setSaving(false);
  };

  return (
    <PageTransition>
      <div className="min-h-screen pb-24">
        <header style={{ paddingTop: 'env(safe-area-inset-top)' }}>
          <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-3">
            <button onClick={() => navigate(-1)} aria-label="Back" className="h-9 w-9 rounded-full bg-white/8 flex items-center justify-center flex-shrink-0">
              <ChevronLeft className="h-5 w-5 text-white" />
            </button>
            <h1 className="font-serif text-[28px]">Profile</h1>
          </div>
        </header>

        <main className="max-w-2xl mx-auto px-4">
          {isLoadingAuth && !baseline && (
            <p className="text-base text-muted-foreground text-center py-16">Loading profile...</p>
          )}

          {!isLoadingAuth && profileLoadError && !baseline && (
            <div className="text-center py-16">
              <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                <User className="h-8 w-8 text-primary" />
              </div>
              <p className="text-base text-muted-foreground">Unable to load your profile.</p>
              <p className="text-base text-muted-foreground">Please try again.</p>
            </div>
          )}

          {baseline && (
            <div className="space-y-6 py-4">
              <div
                className="rounded-2xl p-4 space-y-4"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
              >
                <div className="space-y-1.5">
                  <Label htmlFor="first-name">First Name</Label>
                  <Input
                    id="first-name"
                    value={firstName}
                    maxLength={NAME_MAX_LENGTH}
                    disabled={saving}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder="First name"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="last-name">Last Name</Label>
                  <Input
                    id="last-name"
                    value={lastName}
                    maxLength={NAME_MAX_LENGTH}
                    disabled={saving}
                    onChange={(e) => setLastName(e.target.value)}
                    placeholder="Last name"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label id="email-label" htmlFor="email">Email</Label>
                  <Input id="email" value={user.email || ''} disabled aria-labelledby="email-label" />
                </div>
              </div>

              <div
                className="rounded-2xl p-4 space-y-3"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
              >
                <Label id="timezone-label" htmlFor="timezone-select">Timezone</Label>
                {detectionFailed && !timezone ? (
                  <div>
                    <p className="text-base text-muted-foreground mb-2">Unable to determine your timezone.</p>
                    <p className="text-base text-muted-foreground mb-3">Please choose your timezone.</p>
                  </div>
                ) : null}
                <Select value={timezone} onValueChange={handleTimezoneChange} disabled={saving}>
                  <SelectTrigger id="timezone-select" aria-labelledby="timezone-label">
                    <SelectValue placeholder="Choose Timezone" />
                  </SelectTrigger>
                  <SelectContent>
                    {timezoneOptions.map((tz) => (
                      <SelectItem key={tz} value={tz}>{tz}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {timezoneError && <p className="text-sm text-destructive">{timezoneError}</p>}
                {timezoneIsManual && (
                  <button
                    type="button"
                    onClick={handleResetToAutomatic}
                    disabled={saving}
                    className="text-sm text-primary underline underline-offset-4 disabled:opacity-50"
                  >
                    Return to automatic detection
                  </button>
                )}
              </div>

              {saveError && <p className="text-sm text-destructive">{saveError}</p>}

              <div className="flex gap-3">
                <Button variant="outline" className="flex-1" onClick={handleCancel} disabled={saving || !isDirty}>
                  Cancel
                </Button>
                <Button className="flex-1" onClick={handleSave} disabled={saving || !isDirty}>
                  {saving ? 'Saving...' : 'Save'}
                </Button>
              </div>
            </div>
          )}
        </main>
      </div>
    </PageTransition>
  );
}
