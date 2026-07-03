import { useState } from 'react';
import { entities } from '@/api/entities';
import { supabase } from '@/api/supabaseClient';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { UserPlus, Trash2, Mail, CheckCircle2 } from 'lucide-react';

// Invite a co-owner (e.g. a spouse) to a pet. Unlike sitter access,
// a co-owner gets full owner-level rights: editing, logging, and
// deleting the pet, same as the original owner. Only the original
// owner can manage this list — co-owners can't invite/remove others
// (matches the "full parity, owner-managed" decision).
export default function InviteCoOwnerDialog({ petId, petName, open, onOpenChange }) {
  const [email, setEmail] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [coOwners, setCoOwners] = useState([]);
  const [loaded, setLoaded] = useState(false);

  const load = async () => {
    if (!petId) return;
    const data = await entities.PetCoOwner.filter({ pet_id: petId });
    setCoOwners(data);
    setLoaded(true);
  };

  const handleOpenChange = (val) => {
    if (val && !loaded) load();
    if (!val) { setEmail(''); setError(''); setSuccessMsg(''); setLoaded(false); setCoOwners([]); }
    onOpenChange(val);
  };

  const handleInvite = async (e) => {
    e.preventDefault();
    if (!email.trim() || !petId) return;
    setSaving(true);
    setError('');
    setSuccessMsg('');
    const { data: userData } = await supabase.auth.getUser();
    const me = userData?.user;
    const cleanEmail = email.trim().toLowerCase();

    if (cleanEmail === me.email.toLowerCase()) {
      setError("That's your own email.");
      setSaving(false);
      return;
    }
    const existing = coOwners.find(c => c.co_owner_email === cleanEmail);
    if (existing) {
      setError('Already a co-owner.');
      setSaving(false);
      return;
    }

    await entities.PetCoOwner.create({
      pet_id: petId,
      owner_id: me.id,
      co_owner_email: cleanEmail,
    });

    // Send the invite email via the Edge Function.
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData?.session?.access_token;
    const fnResp = await supabase.functions.invoke('invite-co-owner', {
      body: { coOwnerEmail: cleanEmail, petName, petId },
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });

    if (fnResp.error) {
      // Access record is already saved; just warn rather than block.
      console.error('invite-co-owner function error:', fnResp.error);
      setSuccessMsg(`${cleanEmail} added as co-owner. Invite email could not be sent — they'll see ${petName || 'the pet'} on their next login.`);
    } else if (fnResp.data?.reason === 'test_or_demo_account') {
      setSuccessMsg(`${cleanEmail} added as co-owner. No real email was sent (test/demo accounts don't send production email) — they'll see ${petName || 'the pet'} on their next login.`);
    } else if (fnResp.data?.sent === false) {
      setSuccessMsg(`${cleanEmail} already has a Whisker Watch account and can now see ${petName || 'this pet'}.`);
    } else {
      setSuccessMsg(`Invite sent to ${cleanEmail}!`);
    }

    setEmail('');
    setSaving(false);
    load();
  };

  const handleRemove = async (id) => {
    await entities.PetCoOwner.delete(id);
    load();
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-serif text-xl">Share {petName ? `${petName}'s` : 'Pet'} Profile</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground -mt-1">
          A co-owner gets full access — they can log symptoms, edit details, and manage everything for {petName || 'this pet'}, just like you.
        </p>

        <form onSubmit={handleInvite} className="flex gap-2 mt-1">
          <Input
            type="email"
            placeholder="partner@email.com"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            className="flex-1"
          />
          <Button type="submit" disabled={saving || !email.trim() || !petId} size="sm" className="shrink-0">
            <UserPlus className="h-4 w-4 mr-1" /> Invite
          </Button>
        </form>
        {error && <p className="text-sm text-destructive">{error}</p>}
        {successMsg && (
          <div className="flex items-start gap-2 text-sm text-emerald-500">
            <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        {loaded && coOwners.length > 0 && (
          <div className="mt-2 space-y-2">
            <Label className="text-xs text-muted-foreground uppercase tracking-wide">Co-Owners</Label>
            {coOwners.map(c => (
              <div key={c.id} className="flex items-center justify-between bg-secondary rounded-lg px-3 py-2">
                <div className="flex items-center gap-2">
                  <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-sm">{c.co_owner_email}</span>
                </div>
                <button onClick={() => handleRemove(c.id)} className="text-muted-foreground hover:text-destructive transition-colors p-1">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        {loaded && coOwners.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-2">No co-owners yet — it's just you.</p>
        )}
      </DialogContent>
    </Dialog>
  );
}
