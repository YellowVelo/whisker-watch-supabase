import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { UserPlus, Trash2, Mail } from 'lucide-react';

export default function InviteSitterDialog({ petSitId, open, onOpenChange }) {
  const [email, setEmail] = useState('');
  const [saving, setSaving] = useState(false);
  const [accesses, setAccesses] = useState([]);
  const [loaded, setLoaded] = useState(false);

  const load = async () => {
    if (!petSitId) return;
    const data = await base44.entities.PetSitterAccess.filter({ pet_sit_id: petSitId });
    setAccesses(data);
    setLoaded(true);
  };

  const handleOpenChange = (val) => {
    if (val && !loaded) load();
    if (!val) { setEmail(''); setLoaded(false); setAccesses([]); }
    onOpenChange(val);
  };

  const handleInvite = async (e) => {
    e.preventDefault();
    if (!email.trim() || !petSitId) return;
    setSaving(true);
    const me = await base44.auth.me();
    // Check if already invited
    const existing = accesses.find(a => a.sitter_email === email.trim().toLowerCase());
    if (!existing) {
      await base44.entities.PetSitterAccess.create({
        pet_sit_id: petSitId,
        owner_id: me.id,
        sitter_email: email.trim().toLowerCase(),
      });
      try { await base44.users.inviteUser(email.trim().toLowerCase(), 'user'); } catch (_) {}
    }
    setEmail('');
    setSaving(false);
    load();
  };

  const handleRemove = async (id) => {
    await base44.entities.PetSitterAccess.delete(id);
    load();
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-serif text-xl">Share with Sitter</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground -mt-1">
          The sitter will receive an invitation and can see all pets on this sitting period.
        </p>

        <form onSubmit={handleInvite} className="flex gap-2 mt-1">
          <Input
            type="email"
            placeholder="sitter@email.com"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            className="flex-1"
          />
          <Button type="submit" disabled={saving || !email.trim() || !petSitId} size="sm" className="shrink-0">
            <UserPlus className="h-4 w-4 mr-1" /> Invite
          </Button>
        </form>

        {loaded && accesses.length > 0 && (
          <div className="mt-2 space-y-2">
            <Label className="text-xs text-muted-foreground uppercase tracking-wide">Invited Sitters</Label>
            {accesses.map(a => (
              <div key={a.id} className="flex items-center justify-between bg-secondary rounded-lg px-3 py-2">
                <div className="flex items-center gap-2">
                  <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-sm">{a.sitter_email}</span>
                </div>
                <button onClick={() => handleRemove(a.id)} className="text-muted-foreground hover:text-destructive transition-colors p-1">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        {loaded && accesses.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-2">No sitters invited to this sit yet.</p>
        )}
      </DialogContent>
    </Dialog>
  );
}