import { useState, useEffect, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { entities } from '@/api/entities';
import { supabase } from '@/api/supabaseClient';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Settings as SettingsIcon, Trash2, LogOut, Plus, Pencil, Moon, Sun, Monitor, Menu, UserPlus, RotateCcw, Sprout } from 'lucide-react';
import PageTransition from '../components/PageTransition';
import AddPetDialog from '../components/AddPetDialog';
import EditPetSheet from '../components/EditPetSheet';
import CareMenu from '../components/CareMenu';
import InviteCoOwnerDialog from '../components/InviteCoOwnerDialog';
import { track } from '@/lib/analytics';
import { useAuth } from '@/lib/AuthContext';
import { isTestAccount } from '@/lib/accountType';
import { SEED_SCENARIOS } from '@/lib/seedTestData';

export default function Settings() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const petId = searchParams.get('petId');
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [deleteStep, setDeleteStep] = useState(0); // 0=closed 1=warning 2=confirm
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [editPet, setEditPet] = useState(null);
  const [editOpen, setEditOpen] = useState(false);
  const [careOpen, setCareOpen] = useState(false);
  const [coOwnerOpen, setCoOwnerOpen] = useState(false);

  // Pet deletion (separate flow/dialog/handler from account deletion)
  const [currentUserId, setCurrentUserId] = useState(null);
  const [petCoOwners, setPetCoOwners] = useState([]);
  const [deletePetStep, setDeletePetStep] = useState(0); // 0=closed 1=warning 2=confirm
  const [deletePetConfirmText, setDeletePetConfirmText] = useState('');
  const [deletingPet, setDeletingPet] = useState(false);
  const [deletePetError, setDeletePetError] = useState('');
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  // Test-account tools (reset + seed data) — only ever shown/usable
  // when the signed-in account's profile.account_type is 'test'.
  const [resetOpen, setResetOpen] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [resetError, setResetError] = useState('');
  const [seedOpen, setSeedOpen] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [seedError, setSeedError] = useState('');

  useEffect(() => {
    const goOnline = () => setIsOnline(true);
    const goOffline = () => setIsOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setCurrentUserId(data?.user?.id ?? null));
  }, []);

  useEffect(() => {
    if (!petId) { setEditPet(null); setPetCoOwners([]); return; }
    entities.Pet.get(petId).then(setEditPet).catch(() => setEditPet(null));
    entities.PetCoOwner.filter({ pet_id: petId }).then(setPetCoOwners).catch(() => setPetCoOwners([]));
  }, [petId]);

  const reloadEditPet = () => {
    setEditOpen(false);
    if (petId) entities.Pet.get(petId).then(setEditPet).catch(() => {});
  };

  const openDeleteFlow = () => { setDeleteError(''); setDeleteConfirmText(''); setDeleteStep(1); };
  const closeDeleteFlow = () => { if (!deleting) { setDeleteStep(0); setDeleteConfirmText(''); setDeleteError(''); } };

  const isPrimaryOwner = editPet && currentUserId && editPet.created_by === currentUserId;
  const hasLinkedCoOwner = petCoOwners.some(c => c.co_owner_user_id);

  const openDeletePetFlow = () => {
    setDeletePetError('');
    setDeletePetConfirmText('');
    setDeletePetStep(1);
    track('pet_delete_started', { pet_id: petId });
  };
  const closeDeletePetFlow = () => {
    if (!deletingPet) {
      setDeletePetStep(0);
      setDeletePetConfirmText('');
      setDeletePetError('');
      track('pet_delete_cancelled', { pet_id: petId });
    }
  };

  const handleDeletePet = async () => {
    setDeletingPet(true);
    setDeletePetError('');
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      const { data, error } = await supabase.functions.invoke('delete-pet', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: { pet_id: petId },
      });
      if (error || !data?.success) {
        setDeletePetError(error?.message ?? data?.error ?? "We couldn't delete this pet. Please try again.");
        setDeletingPet(false);
        return;
      }
      track('pet_deleted', { pet_id: petId, mode: data.mode });
      navigate('/', { state: { petDeleted: true, petName: data.pet_name, mode: data.mode } });
    } catch (e) {
      setDeletePetError("We couldn't delete this pet. Please try again.");
      setDeletingPet(false);
    }
  };

  const handleResetTestAccount = async () => {
    setResetting(true);
    setResetError('');
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      const { data, error } = await supabase.functions.invoke('reset-test-account', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (error || !data?.success) {
        setResetError(error?.message ?? data?.error ?? 'Reset failed. Please try again.');
        setResetting(false);
        return;
      }
      track('test_account_reset', {});
      setResetting(false);
      setResetOpen(false);
      navigate('/', { state: { petDeleted: true, petName: 'Your test data', mode: 'deleted' } });
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
      // clear existing test data first so each scenario starts clean.
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      const { data, error } = await supabase.functions.invoke('reset-test-account', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (error || !data?.success) {
        setSeedError(error?.message ?? data?.error ?? 'Could not clear existing test data before seeding.');
        setSeeding(false);
        return;
      }
      await scenario.run();
      track('test_account_seeded', { scenario: scenario.key });
      setSeeding(false);
      setSeedOpen(false);
      navigate('/');
    } catch (e) {
      setSeedError('Seeding failed. Please try again.');
      setSeeding(false);
    }
  };

  const handleDeleteAccount = async () => {
    setDeleting(true);
    setDeleteError('');
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      const { data, error } = await supabase.functions.invoke('delete-account', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (error || !data?.success) {
        setDeleteError(error?.message ?? data?.error ?? 'Something went wrong. Please try again.');
        setDeleting(false);
        return;
      }
      // Success — sign out and redirect. The auth row is already gone server-side
      // so signOut() is best-effort; navigate regardless.
      await supabase.auth.signOut().catch(() => {});
      window.location.href = '/login?deleted=1';
    } catch (e) {
      setDeleteError('Something went wrong. Please try again.');
      setDeleting(false);
    }
  };

  const rows = [
    ...(isTestAccount(user) ? [{
      section: 'Test Tools',
      items: [
        {
          label: 'Seed Test Data',
          icon: Sprout,
          color: 'text-primary',
          action: () => { setSeedError(''); setSeedOpen(true); },
          destructive: false,
        },
        {
          label: 'Reset Test Account',
          icon: RotateCcw,
          color: 'text-destructive',
          action: () => { setResetError(''); setResetOpen(true); },
          destructive: false,
        },
      ],
    }] : []),
    {
      section: 'Pets',
      items: [
        ...(editPet ? [{
          label: `Edit ${editPet.name}`,
          icon: Pencil,
          color: 'text-primary',
          action: () => setEditOpen(true),
          destructive: false,
        }, {
          label: `Share ${editPet.name} with a Co-Owner`,
          icon: UserPlus,
          color: 'text-primary',
          action: () => setCoOwnerOpen(true),
          destructive: false,
        }, {
          label: `Delete ${editPet.name}`,
          icon: Trash2,
          color: 'text-destructive',
          action: openDeletePetFlow,
          destructive: false,
          disabled: !isOnline,
          sublabel: !isOnline ? 'You need to be online to delete a pet.' : undefined,
        }] : []),
        {
          label: 'Add a Pet',
          icon: Plus,
          color: 'text-primary',
          action: () => setShowAdd(true),
          destructive: false,
        },
      ],
    },
    {
      section: 'Account',
      items: [
        {
          label: 'Sign Out',
          icon: LogOut,
          color: 'text-foreground',
          action: () => { supabase.auth.signOut().then(() => { window.location.href = '/login'; }); },
          destructive: false,
        },
        {
          label: 'Delete Account & All Data',
          icon: Trash2,
          color: 'text-destructive',
          action: openDeleteFlow,
          destructive: false,
        },
      ],
    },
    {
      section: 'About',
      items: [
        { label: 'Wysker Watch', sublabel: 'Pet Health Tracker', icon: SettingsIcon, color: 'text-muted-foreground', static: true },
      ],
    },
  ];

  return (
    <PageTransition>
      <div className="min-h-screen pb-24">
        <header
          className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10"
          style={{ paddingTop: 'env(safe-area-inset-top)' }}
        >
          <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-3">
            <h1 className="font-serif text-xl flex-1">Settings</h1>
            {petId && (
              <button onClick={() => setCareOpen(true)} className="h-9 w-9 rounded-full bg-secondary flex items-center justify-center">
                <Menu className="h-5 w-5" />
              </button>
            )}
          </div>
        </header>
        <CareMenu open={careOpen} onOpenChange={setCareOpen} petId={petId} petName={editPet?.name} />

        <main className="max-w-2xl mx-auto px-4 py-6 space-y-6">
          {rows.map(({ section, items }) => (
            <div key={section}>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-1">{section}</p>
              <div className="bg-card border border-border rounded-xl overflow-hidden divide-y divide-border">
                {items.map((item, i) => {
                  const Icon = item.icon;
                  if (item.static) {
                    return (
                      <div key={i} className="flex items-center gap-3 px-4 py-3.5">
                        <Icon className={`h-4.5 w-4.5 ${item.color}`} />
                        <div>
                          <p className="text-sm font-medium">{item.label}</p>
                          {item.sublabel && <p className="text-xs text-muted-foreground">{item.sublabel}</p>}
                        </div>
                      </div>
                    );
                  }
                  if (item.color === 'text-destructive') {
                    return (
                      <button
                        key={i}
                        onClick={item.action}
                        disabled={item.disabled}
                        className={`w-full flex items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-destructive/5 min-h-[52px] disabled:opacity-40 disabled:hover:bg-transparent ${item.color}`}
                      >
                        <Icon className="h-4.5 w-4.5" />
                        <div>
                          <span className="text-sm font-medium block">{item.label}</span>
                          {item.sublabel && <span className="text-xs text-muted-foreground">{item.sublabel}</span>}
                        </div>
                      </button>
                    );
                  }
                  return (
                    <button
                      key={i}
                      onClick={item.action}
                      className={`w-full flex items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-secondary/50 min-h-[52px] ${item.color}`}
                    >
                      <Icon className="h-4.5 w-4.5" />
                      <span className="text-sm font-medium">{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </main>

        <AddPetDialog open={showAdd} onOpenChange={setShowAdd} />
        {editPet && <EditPetSheet pet={editPet} open={editOpen} onOpenChange={setEditOpen} onSuccess={reloadEditPet} />}
        {editPet && <InviteCoOwnerDialog petId={petId} petName={editPet.name} open={coOwnerOpen} onOpenChange={setCoOwnerOpen} />}

        {/* Step 1 — Warning */}
        <Dialog open={deleteStep === 1} onOpenChange={(v) => !v && closeDeleteFlow()}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="font-serif text-xl text-destructive">Delete Account?</DialogTitle>
            </DialogHeader>
            <DialogDescription asChild>
              <div className="space-y-3 text-sm text-muted-foreground">
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
              <button onClick={closeDeleteFlow} className="flex-1 h-10 rounded-lg border border-border text-sm font-medium hover:bg-secondary transition-colors">Cancel</button>
              <button
                onClick={() => setDeleteStep(2)}
                className="flex-1 h-10 rounded-lg bg-destructive text-destructive-foreground text-sm font-medium hover:bg-destructive/90 transition-colors"
              >
                Continue
              </button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Step 2 — Type DELETE to confirm */}
        <Dialog open={deleteStep === 2} onOpenChange={(v) => !v && closeDeleteFlow()}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="font-serif text-xl text-destructive">Confirm Deletion</DialogTitle>
            </DialogHeader>
            <DialogDescription asChild>
              <div className="space-y-3 text-sm text-muted-foreground">
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
              <button onClick={closeDeleteFlow} disabled={deleting} className="flex-1 h-10 rounded-lg border border-border text-sm font-medium hover:bg-secondary transition-colors disabled:opacity-50">Cancel</button>
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

        {/* Delete Pet — Step 1: Warning (separate flow from account deletion) */}
        <Dialog open={deletePetStep === 1} onOpenChange={(v) => !v && closeDeletePetFlow()}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="font-serif text-xl text-destructive">Delete {editPet?.name}?</DialogTitle>
            </DialogHeader>
            <DialogDescription asChild>
              <div className="space-y-3 text-sm text-muted-foreground">
                {isPrimaryOwner && hasLinkedCoOwner ? (
                  <>
                    <p>
                      You share {editPet?.name} with a co-owner. Removing {editPet?.name} from your account will
                      transfer full ownership to your co-owner — you'll no longer have access to their profile,
                      logs, medications, records, or photos.
                    </p>
                    <p>Your co-owner will keep {editPet?.name} and all of their health history.</p>
                  </>
                ) : !isPrimaryOwner ? (
                  <>
                    <p>
                      You'll be removed as a co-owner of {editPet?.name}. The primary owner keeps full access and
                      all of {editPet?.name}'s health history.
                    </p>
                  </>
                ) : (
                  <p>
                    This will permanently delete {editPet?.name} and all information connected to them, including
                    logs, medications, records, photos, and reports.
                  </p>
                )}
                <p>This will not delete your Wysker Watch account or any other pets.</p>
                <p className="font-medium text-foreground">This cannot be undone.</p>
              </div>
            </DialogDescription>
            <DialogFooter className="mt-2 gap-2">
              <button onClick={closeDeletePetFlow} className="flex-1 h-10 rounded-lg border border-border text-sm font-medium hover:bg-secondary transition-colors">Cancel</button>
              <button
                onClick={() => setDeletePetStep(2)}
                className="flex-1 h-10 rounded-lg bg-destructive text-destructive-foreground text-sm font-medium hover:bg-destructive/90 transition-colors"
              >
                Continue
              </button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Pet — Step 2: Type pet name to confirm */}
        <Dialog open={deletePetStep === 2} onOpenChange={(v) => !v && closeDeletePetFlow()}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="font-serif text-xl text-destructive">Confirm Deletion</DialogTitle>
            </DialogHeader>
            <DialogDescription asChild>
              <div className="space-y-3 text-sm text-muted-foreground">
                <p>Type <strong className="text-foreground font-mono">{editPet?.name}</strong> to confirm.</p>
              </div>
            </DialogDescription>
            <Input
              value={deletePetConfirmText}
              onChange={e => setDeletePetConfirmText(e.target.value)}
              placeholder={editPet?.name}
              className="font-mono"
              autoCapitalize="none"
              autoCorrect="off"
              disabled={deletingPet}
            />
            {deletePetError && <p className="text-sm text-destructive">{deletePetError}</p>}
            <DialogFooter className="mt-2 gap-2">
              <button onClick={closeDeletePetFlow} disabled={deletingPet} className="flex-1 h-10 rounded-lg border border-border text-sm font-medium hover:bg-secondary transition-colors disabled:opacity-50">Cancel</button>
              <button
                onClick={handleDeletePet}
                disabled={deletePetConfirmText !== editPet?.name || deletingPet || !isOnline}
                className="flex-1 h-10 rounded-lg bg-destructive text-destructive-foreground text-sm font-medium hover:bg-destructive/90 transition-colors disabled:opacity-40"
              >
                {deletingPet ? 'Deleting…' : 'Delete Pet'}
              </button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Reset Test Account — internal/test-only, guarded server-side too */}
        <Dialog open={resetOpen} onOpenChange={(v) => !v && !resetting && setResetOpen(false)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="font-serif text-xl text-destructive">Reset Test Account?</DialogTitle>
            </DialogHeader>
            <DialogDescription asChild>
              <div className="space-y-3 text-sm text-muted-foreground">
                <p>This deletes all pets and pet data on this test account. Your login is not affected.</p>
                <p className="font-medium text-foreground">This cannot be undone.</p>
              </div>
            </DialogDescription>
            {resetError && <p className="text-sm text-destructive">{resetError}</p>}
            <DialogFooter className="mt-2 gap-2">
              <button onClick={() => setResetOpen(false)} disabled={resetting} className="flex-1 h-10 rounded-lg border border-border text-sm font-medium hover:bg-secondary transition-colors disabled:opacity-50">Cancel</button>
              <button
                onClick={handleResetTestAccount}
                disabled={resetting}
                className="flex-1 h-10 rounded-lg bg-destructive text-destructive-foreground text-sm font-medium hover:bg-destructive/90 transition-colors disabled:opacity-40"
              >
                {resetting ? 'Resetting…' : 'Reset Test Account'}
              </button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Seed Test Data */}
        <Dialog open={seedOpen} onOpenChange={(v) => !v && !seeding && setSeedOpen(false)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="font-serif text-xl">Seed Test Data</DialogTitle>
            </DialogHeader>
            <DialogDescription asChild>
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>Choose a scenario. This replaces any existing test data on this account.</p>
              </div>
            </DialogDescription>
            <div className="space-y-2">
              {SEED_SCENARIOS.map(s => (
                <button
                  key={s.key}
                  onClick={() => handleSeed(s)}
                  disabled={seeding}
                  className="w-full text-left px-4 py-3 rounded-lg border border-border hover:bg-secondary/50 transition-colors disabled:opacity-40"
                >
                  <p className="text-sm font-medium">{s.label}</p>
                  <p className="text-xs text-muted-foreground">{s.description}</p>
                </button>
              ))}
            </div>
            {seedError && <p className="text-sm text-destructive">{seedError}</p>}
            <DialogFooter className="mt-2">
              <button onClick={() => setSeedOpen(false)} disabled={seeding} className="flex-1 h-10 rounded-lg border border-border text-sm font-medium hover:bg-secondary transition-colors disabled:opacity-50">
                {seeding ? 'Seeding…' : 'Cancel'}
              </button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </PageTransition>
  );
}
