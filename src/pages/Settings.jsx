import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  User, Bell, ShieldCheck, Settings as SettingsIcon, HelpCircle,
  LogOut, Trash2, Lock, ChevronRight, Sprout, RotateCcw, UsersRound, Sparkles, FileText,
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import MenuListRow from '../components/MenuListRow';
import MenuIllustration from '../components/MenuIllustration';
import PageTransition from '../components/PageTransition';
import { useToast } from '@/components/ui/use-toast';
import { track } from '@/lib/analytics';
import { useAuth } from '@/lib/AuthContext';
import { isDemoAccount, isInternalAccount } from '@/lib/accountType';
import { getDisplayName } from '@/lib/profileName';
import { SEED_SCENARIOS } from '@/lib/seedTestData';
import { deleteAccount, resetSandboxAccount, signOutBestEffort } from '@/lib/accountClient';

const ACCOUNT_TYPE_BADGES = {
  production: { label: 'Production', className: 'text-emerald-400 bg-emerald-400/10' },
  test: { label: 'Test', className: 'text-amber-400 bg-amber-400/10' },
  demo: { label: 'Demo', className: 'text-violet-400 bg-violet-400/10' },
};

const MENU_ITEMS = [
  { key: 'pet_sitter', to: '/settings/pet-sitter', icon: UsersRound, iconClassName: 'text-teal-300', iconBg: 'rgba(45,212,191,0.14)', title: 'Pet Sitter', subtitle: 'Manage sitter access and instructions', event: 'menu_pet_sitter_selected' },
  { key: 'ai', to: '/settings/ai', icon: Sparkles, iconClassName: 'text-fuchsia-300', iconBg: 'rgba(232,121,249,0.14)', title: 'AI', subtitle: 'Insights and answers about your pets', event: 'menu_ai_selected' },
  { key: 'notifications', to: '/notifications', icon: Bell, iconClassName: 'text-amber-300', iconBg: 'rgba(251,191,36,0.14)', title: 'Notifications', subtitle: 'Manage your notification preferences', event: 'menu_notifications_selected' },
  { key: 'privacy', to: '/privacy', icon: ShieldCheck, iconClassName: 'text-emerald-300', iconBg: 'rgba(52,211,153,0.14)', title: 'Privacy', subtitle: 'Read our Privacy Policy', event: 'menu_privacy_selected' },
  { key: 'terms', to: '/terms', icon: FileText, iconClassName: 'text-orange-300', iconBg: 'rgba(253,186,116,0.14)', title: 'Terms of Service', subtitle: 'Read our Terms of Service', event: 'menu_terms_selected' },
  { key: 'preferences', to: '/preferences', icon: SettingsIcon, iconClassName: 'text-purple-300', iconBg: 'rgba(196,181,253,0.14)', title: 'Settings', subtitle: 'App preferences and defaults', event: 'menu_settings_selected' },
  { key: 'support', to: '/support', icon: HelpCircle, iconClassName: 'text-sky-300', iconBg: 'rgba(125,211,252,0.14)', title: 'Support', subtitle: 'Help center and contact support', event: 'menu_support_selected' },
];

// Single source of truth for "which dialog is open" so two confirmation
// dialogs can never be visible at once (a user rapidly tapping Sign Out
// then Reset Test Account, etc. just replaces which one is showing,
// rather than stacking both).
const DIALOG = {
  NONE: null,
  SIGN_OUT: 'sign-out',
  DELETE_WARNING: 'delete-warning',
  DELETE_CONFIRM: 'delete-confirm',
  RESET: 'reset',
  SEED: 'seed',
};

export default function Settings() {
  const { user, isLoadingAuth, logout, profileLoadError, checkUserAuth } = useAuth();
  const { toast } = useToast();

  const [activeDialog, setActiveDialog] = useState(DIALOG.NONE);

  const [signingOut, setSigningOut] = useState(false);

  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [deleteConfirmText, setDeleteConfirmText] = useState('');

  // Internal-account tools (reset + seed data) — only ever shown/usable
  // when isInternalAccount(user) is true (every test account, or a demo
  // account explicitly flagged admin — see src/lib/accountType.js).
  const [resetting, setResetting] = useState(false);
  const [resetError, setResetError] = useState('');
  const [seeding, setSeeding] = useState(false);
  const [seedError, setSeedError] = useState('');

  // Single source of truth for how the internal tools refer to this
  // account in user-facing copy, instead of repeating the
  // isDemoAccount(user) ternary at every call site.
  const accountLabel = isDemoAccount(user) ? 'Demo' : 'Test';

  useEffect(() => {
    track('menu_opened', {});
  }, []);

  const isBusy = signingOut || deleting || resetting || seeding;

  const closeDialog = () => { if (!isBusy) setActiveDialog(DIALOG.NONE); };

  const openDeleteFlow = () => {
    track('delete_account_selected', {});
    setDeleteError('');
    setDeleteConfirmText('');
    setActiveDialog(DIALOG.DELETE_WARNING);
  };

  const handleSignOutSelected = () => {
    track('sign_out_selected', {});
    setActiveDialog(DIALOG.SIGN_OUT);
  };

  const handleConfirmSignOut = async () => {
    setSigningOut(true);
    track('sign_out_confirmed', {});
    try {
      await logout();
    } catch (e) {
      setSigningOut(false);
      setActiveDialog(DIALOG.NONE);
      toast({ description: 'Unable to sign out. Please try again.' });
    }
  };

  const handleResetSandboxAccount = async () => {
    setResetting(true);
    setResetError('');
    try {
      const { data, error } = await resetSandboxAccount();
      if (error || !data?.success) {
        setResetError(error?.message ?? data?.error ?? 'Reset failed. Please try again.');
        setResetting(false);
        return;
      }
      track('sandbox_account_reset', {});
      setResetting(false);
      setActiveDialog(DIALOG.NONE);
      window.location.href = '/';
    } catch (e) {
      setResetError('Reset failed. Please try again.');
      setResetting(false);
    }
  };

  const handleSeed = async (scenario) => {
    setSeeding(true);
    setSeedError('');
    try {
      // Seeding scenarios add pets on top of whatever's already there —
      // clear existing sample data first so each scenario starts clean.
      const { data, error } = await resetSandboxAccount();
      if (error || !data?.success) {
        setSeedError(error?.message ?? data?.error ?? 'Could not clear existing sample data before seeding.');
        setSeeding(false);
        return;
      }
      await scenario.run();
      track('sandbox_account_seeded', { scenario: scenario.key });
      setSeeding(false);
      setActiveDialog(DIALOG.NONE);
      window.location.href = '/';
    } catch (e) {
      setSeedError('Seeding failed. Please try again.');
      setSeeding(false);
    }
  };

  const handleDeleteAccount = async () => {
    setDeleting(true);
    setDeleteError('');
    track('delete_account_confirmed', {});
    try {
      const { data, error } = await deleteAccount();
      if (error || !data?.success) {
        setDeleteError(error?.message ?? data?.error ?? 'Unable to delete account. Please try again later.');
        setDeleting(false);
        return;
      }
      // Success — sign out and redirect. The auth row is already gone
      // server-side, so signOutBestEffort() is fire-and-forget; navigate
      // regardless of whether it succeeds.
      await signOutBestEffort();
      window.location.href = '/login?deleted=1';
    } catch (e) {
      setDeleteError('Unable to delete account. Please try again later.');
      setDeleting(false);
    }
  };

  if (isLoadingAuth) {
    return (
      <PageTransition>
        <div className="min-h-screen pb-28">
          <header style={{ paddingTop: 'env(safe-area-inset-top)' }}>
            <div className="max-w-2xl mx-auto px-5 py-6">
              <div className="h-4 w-56 rounded-full animate-pulse" style={{ background: 'rgba(255,255,255,0.06)' }} />
              <div className="h-8 w-32 rounded-full animate-pulse mt-2" style={{ background: 'rgba(255,255,255,0.08)' }} />
            </div>
          </header>
          <main className="max-w-2xl mx-auto px-4 space-y-4" aria-busy="true" aria-label="Loading menu">
            <div className="h-24 rounded-2xl animate-pulse" style={{ background: 'rgba(255,255,255,0.05)' }} />
            <div className="rounded-2xl overflow-hidden">
              {[0, 1, 2, 3, 4].map((i) => (
                <div key={i} className="h-16 animate-pulse" style={{ background: 'rgba(255,255,255,0.04)', marginBottom: 1 }} />
              ))}
            </div>
          </main>
        </div>
      </PageTransition>
    );
  }

  if (!user || profileLoadError) {
    return (
      <PageTransition>
        <div className="min-h-screen pb-28 flex items-center justify-center">
          <div className="text-center px-6">
            <p className="text-sm text-muted-foreground mb-4">Unable to load your account information.</p>
            <button onClick={() => checkUserAuth()} className="text-sm font-medium text-primary underline">Retry</button>
          </div>
        </div>
      </PageTransition>
    );
  }

  const accountType = ACCOUNT_TYPE_BADGES[user?.account_type] ? user.account_type : 'production';
  const badge = ACCOUNT_TYPE_BADGES[accountType];
  const displayName = getDisplayName(user) || 'Email unavailable';
  const email = user?.email || 'Email unavailable';

  return (
    <PageTransition>
      <div className="min-h-screen pb-28">
        <header style={{ paddingTop: 'env(safe-area-inset-top)' }}>
          <div className="max-w-2xl mx-auto px-5 py-6 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-[28px] font-bold text-foreground tracking-tight leading-tight">Menu</h1>
              <p className="text-[14px] text-white/45 mt-1">Manage your account and app settings.</p>
            </div>
            <MenuIllustration />
          </div>
        </header>

        <main className="max-w-2xl mx-auto px-4 space-y-4">
          {/* User summary card */}
          <Link
            to="/account"
            className="w-full flex items-center gap-3 rounded-2xl px-4 py-4 active:opacity-80 transition-opacity"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
          >
            <div
              className="h-14 w-14 rounded-full flex items-center justify-center flex-shrink-0"
              style={{ background: 'rgba(255,255,255,0.06)' }}
            >
              <User className="h-6 w-6 text-blue-300" aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[17px] font-bold text-white truncate">{displayName}</p>
              <p className="text-[13px] text-white/45 truncate">{email}</p>
              <span className={`inline-flex items-center gap-1 mt-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${badge.className}`}>
                {badge.label}
              </span>
            </div>
            <ChevronRight className="h-5 w-5 text-white/30 flex-shrink-0" aria-hidden="true" />
          </Link>

          {/* Primary menu */}
          <div className="rounded-2xl overflow-hidden divide-y" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderColor: 'rgba(255,255,255,0.08)' }}>
            {MENU_ITEMS.map((item) => (
              <MenuListRow
                key={item.key}
                to={item.to}
                icon={item.icon}
                iconClassName={item.iconClassName}
                iconBg={item.iconBg}
                title={item.title}
                subtitle={item.subtitle}
                onClick={() => track(item.event, {})}
              />
            ))}
          </div>

          {isInternalAccount(user) && (
            <div className="rounded-2xl overflow-hidden divide-y" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderColor: 'rgba(255,255,255,0.08)' }}>
              <MenuListRow
                icon={Sprout}
                iconClassName="text-primary"
                title="Seed Test Data"
                subtitle="Load a sample data scenario"
                onClick={() => { setSeedError(''); setActiveDialog(DIALOG.SEED); }}
              />
              <MenuListRow
                icon={RotateCcw}
                iconClassName="text-destructive"
                title={`Reset ${accountLabel} Account`}
                subtitle="Clear all pets and sample data"
                onClick={() => { setResetError(''); setActiveDialog(DIALOG.RESET); }}
              />
            </div>
          )}

          {/* Account actions */}
          <div className="rounded-2xl overflow-hidden divide-y" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderColor: 'rgba(255,255,255,0.08)' }}>
            <MenuListRow
              icon={LogOut}
              iconClassName="text-blue-300"
              iconBg="rgba(96,165,250,0.14)"
              title="Sign Out"
              subtitle="Sign out of Wysker Watch"
              onClick={handleSignOutSelected}
            />
            <MenuListRow
              icon={Trash2}
              iconClassName="text-destructive"
              iconBg="rgba(248,113,113,0.14)"
              destructive
              title="Delete Account"
              subtitle="Permanently delete your account and all data"
              onClick={openDeleteFlow}
            />
          </div>

          {/* Security footer */}
          <div className="flex items-start gap-2 justify-center text-center px-4 py-2">
            <Lock className="h-3.5 w-3.5 text-white/30 flex-shrink-0 mt-0.5" aria-hidden="true" />
            <p className="text-sm text-white/35 leading-snug">
              Your data is encrypted and securely stored.
              <br />
              We never share your information.
            </p>
          </div>
        </main>

        {/* Sign Out confirmation */}
        <Dialog open={activeDialog === DIALOG.SIGN_OUT} onOpenChange={(v) => !v && closeDialog()}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="font-serif text-2xl">Sign Out?</DialogTitle>
            </DialogHeader>
            <DialogDescription asChild>
              <p className="text-base text-muted-foreground">You'll need to sign in again to access your pets.</p>
            </DialogDescription>
            <DialogFooter className="mt-2 gap-2">
              <button onClick={closeDialog} disabled={signingOut} className="flex-1 h-10 rounded-lg border border-border text-sm font-medium hover:bg-secondary transition-colors disabled:opacity-50">Cancel</button>
              <button
                onClick={handleConfirmSignOut}
                disabled={signingOut}
                className="flex-1 h-10 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-40"
              >
                {signingOut ? 'Signing Out…' : 'Sign Out'}
              </button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Account — Step 1: Warning */}
        <Dialog open={activeDialog === DIALOG.DELETE_WARNING} onOpenChange={(v) => !v && closeDialog()}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="font-serif text-2xl text-destructive">Delete Account?</DialogTitle>
            </DialogHeader>
            <DialogDescription asChild>
              <div className="space-y-3 text-base text-muted-foreground">
                <p>This will permanently delete your account and remove your access to all pets.</p>
                <ul className="list-disc pl-4 space-y-1">
                  <li>Pets you <strong className="text-foreground">solely own</strong> will be permanently deleted along with all their health records.</li>
                  <li>Pets you <strong className="text-foreground">share with a co-owner</strong> will survive — ownership transfers to your co-owner.</li>
                  <li>Your uploaded photos and documents will be permanently deleted.</li>
                </ul>
                <p className="font-medium text-foreground">This cannot be undone.</p>
              </div>
            </DialogDescription>
            <DialogFooter className="mt-2 gap-2">
              <button onClick={closeDialog} className="flex-1 h-10 rounded-lg border border-border text-sm font-medium hover:bg-secondary transition-colors">Cancel</button>
              <button
                onClick={() => setActiveDialog(DIALOG.DELETE_CONFIRM)}
                className="flex-1 h-10 rounded-lg bg-destructive text-destructive-foreground text-sm font-medium hover:bg-destructive/90 transition-colors"
              >
                Continue
              </button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Account — Step 2: Type DELETE to confirm */}
        <Dialog open={activeDialog === DIALOG.DELETE_CONFIRM} onOpenChange={(v) => !v && closeDialog()}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="font-serif text-2xl text-destructive">Confirm Deletion</DialogTitle>
            </DialogHeader>
            <DialogDescription asChild>
              <div className="space-y-3 text-base text-muted-foreground">
                <p>Type <strong className="text-foreground font-mono">DELETE</strong> to permanently delete your account.</p>
              </div>
            </DialogDescription>
            <Input
              value={deleteConfirmText}
              onChange={e => setDeleteConfirmText(e.target.value)}
              placeholder="Type DELETE"
              className="font-mono"
              autoCapitalize="none"
              autoCorrect="off"
              disabled={deleting}
            />
            {deleteError && <p className="text-sm text-destructive">{deleteError}</p>}
            <DialogFooter className="mt-2 gap-2">
              <button onClick={closeDialog} disabled={deleting} className="flex-1 h-10 rounded-lg border border-border text-sm font-medium hover:bg-secondary transition-colors disabled:opacity-50">Cancel</button>
              <button
                onClick={handleDeleteAccount}
                disabled={deleteConfirmText !== 'DELETE' || deleting}
                className="flex-1 h-10 rounded-lg bg-destructive text-destructive-foreground text-sm font-medium hover:bg-destructive/90 transition-colors disabled:opacity-40"
              >
                {deleting ? 'Deleting…' : 'Delete My Account'}
              </button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Reset Test/Demo Account — internal-only, guarded server-side too */}
        <Dialog open={activeDialog === DIALOG.RESET} onOpenChange={(v) => !v && closeDialog()}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="font-serif text-2xl text-destructive">Reset {accountLabel} Account?</DialogTitle>
            </DialogHeader>
            <DialogDescription asChild>
              <div className="space-y-3 text-base text-muted-foreground">
                <p>This deletes all pets and pet data on this {accountLabel.toLowerCase()} account. Your login is not affected.</p>
                <p className="font-medium text-foreground">This cannot be undone.</p>
              </div>
            </DialogDescription>
            {resetError && <p className="text-sm text-destructive">{resetError}</p>}
            <DialogFooter className="mt-2 gap-2">
              <button onClick={closeDialog} disabled={resetting} className="flex-1 h-10 rounded-lg border border-border text-sm font-medium hover:bg-secondary transition-colors disabled:opacity-50">Cancel</button>
              <button
                onClick={handleResetSandboxAccount}
                disabled={resetting}
                className="flex-1 h-10 rounded-lg bg-destructive text-destructive-foreground text-sm font-medium hover:bg-destructive/90 transition-colors disabled:opacity-40"
              >
                {resetting ? 'Resetting…' : `Reset ${accountLabel} Account`}
              </button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Seed Test Data */}
        <Dialog open={activeDialog === DIALOG.SEED} onOpenChange={(v) => !v && closeDialog()}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="font-serif text-2xl">Seed Test Data</DialogTitle>
            </DialogHeader>
            <DialogDescription asChild>
              <div className="space-y-2 text-base text-muted-foreground">
                <p>Choose a scenario. This replaces any existing test data on this account.</p>
              </div>
            </DialogDescription>
            <div className="space-y-2">
              {SEED_SCENARIOS.filter(s => s.audience.includes(accountLabel.toLowerCase())).map(s => (
                <button
                  key={s.key}
                  onClick={() => handleSeed(s)}
                  disabled={seeding}
                  className="w-full text-left px-4 py-3 rounded-lg border border-border hover:bg-secondary/50 transition-colors disabled:opacity-40"
                >
                  <p className="text-sm font-medium">{s.label}</p>
                  <p className="text-sm text-muted-foreground">{s.description}</p>
                </button>
              ))}
            </div>
            {seedError && <p className="text-sm text-destructive">{seedError}</p>}
            <DialogFooter className="mt-2">
              <button onClick={closeDialog} disabled={seeding} className="flex-1 h-10 rounded-lg border border-border text-sm font-medium hover:bg-secondary transition-colors disabled:opacity-50">
                {seeding ? 'Seeding…' : 'Cancel'}
              </button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </PageTransition>
  );
}
