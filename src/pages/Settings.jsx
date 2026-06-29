import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { entities } from '@/api/entities';
import { supabase } from '@/api/supabaseClient';
import { Button } from '@/components/ui/button';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
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

  const handleDeleteAccount = async () => {
    setDeleting(true);
    // Delete all user data then log out.
    // NOTE: this only deletes pet/health data, same as before — it
    // does not delete the actual Supabase Auth account. True account
    // deletion needs a service-role Edge Function (can't be done
    // safely from the client with the anon key).
    try {
      const pets = await entities.Pet.list();
      for (const pet of pets) {
        await entities.SymptomLog.filter({ pet_id: pet.id }).then(logs =>
          Promise.all(logs.map(l => entities.SymptomLog.delete(l.id)))
        );
        await entities.Medication.filter({ pet_id: pet.id }).then(meds =>
          Promise.all(meds.map(m => entities.Medication.delete(m.id)))
        );
        await entities.FoodLog.filter({ pet_id: pet.id }).then(foods =>
          Promise.all(foods.map(f => entities.FoodLog.delete(f.id)))
        );
        await entities.Pet.delete(pet.id);
      }
      await supabase.auth.signOut();
      window.location.href = '/';
    } catch (e) {
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
          destructive: true,
        },
      ],
    },
    {
      section: 'About',
      items: [
        { label: 'Whisker Watch', sublabel: 'Pet Health Tracker', icon: SettingsIcon, color: 'text-muted-foreground', static: true },
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
                  if (item.destructive) {
                    return (
                      <AlertDialog key={i}>
                        <AlertDialogTrigger asChild>
                          <button className={`w-full flex items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-destructive/5 min-h-[52px] ${item.color}`}>
                            <Icon className="h-4.5 w-4.5" />
                            <span className="text-sm font-medium">{item.label}</span>
                          </button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete Account?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This will permanently delete all your pets, symptom logs, medications, and food data. This action cannot be undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              onClick={handleDeleteAccount}
                              disabled={deleting}
                            >
                              {deleting ? 'Deleting...' : 'Delete Everything'}
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
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
      </div>
    </PageTransition>
  );
}
