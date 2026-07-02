import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { entities } from '@/api/entities';
import { supabase } from '@/api/supabaseClient';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Settings as SettingsIcon, Trash2, LogOut, Plus, Pencil, Moon, Sun, Monitor, Menu, UserPlus } from 'lucide-react';
import PageTransition from '../components/PageTransition';
import AddPetDialog from '../components/AddPetDialog';
import EditPetSheet from '../components/EditPetSheet';
import CareMenu from '../components/CareMenu';
import InviteCoOwnerDialog from '../components/InviteCoOwnerDialog';

export default function Settings() {
  const [searchParams] = useSearchParams();
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

  useEffect(() => {
    if (!petId) { setEditPet(null); return; }
    entities.Pet.get(petId).then(setEditPet).catch(() => setEditPet(null));
  }, [petId]);

  const reloadEditPet = () => {
    setEditOpen(false);
    if (petId) entities.Pet.get(petId).then(setEditPet).catch(() => {});
  };

  const openDeleteFlow = () => { setDeleteError(''); setDeleteConfirmText(''); setDeleteStep(1); };
  const closeDeleteFlow = () => { if (!deleting) { setDeleteStep(0); setDeleteConfirmText(''); setDeleteError(''); } };

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
                  if (item.destructive === false && item.action === openDeleteFlow) {
                    return (
                      <button
                        key={i}
                        onClick={item.action}
                        className={`w-full flex items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-destructive/5 min-h-[52px] ${item.color}`}
                      >
                        <Icon className="h-4.5 w-4.5" />
                        <span className="text-sm font-medium">{item.label}</span>
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

        <AddPetDialog open={showAdd} onOpenChange={setShowAdd} onSuccess={() => setShowAdd(false)} />
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
      </div>
    </PageTransition>
  );
}
