import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Settings as SettingsIcon, Trash2, LogOut, Moon, Sun, Monitor } from 'lucide-react';
import PageTransition from '../components/PageTransition';

export default function Settings() {
  const [deleting, setDeleting] = useState(false);

  const handleDeleteAccount = async () => {
    setDeleting(true);
    // Delete all user data then log out
    try {
      const cats = await base44.entities.Cat.list();
      for (const cat of cats) {
        await base44.entities.SymptomLog.filter({ cat_id: cat.id }).then(logs =>
          Promise.all(logs.map(l => base44.entities.SymptomLog.delete(l.id)))
        );
        await base44.entities.Medication.filter({ cat_id: cat.id }).then(meds =>
          Promise.all(meds.map(m => base44.entities.Medication.delete(m.id)))
        );
        await base44.entities.FoodLog.filter({ cat_id: cat.id }).then(foods =>
          Promise.all(foods.map(f => base44.entities.FoodLog.delete(f.id)))
        );
        await base44.entities.Cat.delete(cat.id);
      }
      base44.auth.logout('/');
    } catch (e) {
      setDeleting(false);
    }
  };

  const rows = [
    {
      section: 'Account',
      items: [
        {
          label: 'Sign Out',
          icon: LogOut,
          color: 'text-foreground',
          action: () => base44.auth.logout('/'),
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
        { label: 'Whisker Watch', sublabel: 'Cat Health Tracker', icon: SettingsIcon, color: 'text-muted-foreground', static: true },
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
          <div className="max-w-2xl mx-auto px-4 py-4">
            <h1 className="font-serif text-xl">Settings</h1>
          </div>
        </header>

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
                              This will permanently delete all your cats, symptom logs, medications, and food data. This action cannot be undone.
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
      </div>
    </PageTransition>
  );
}