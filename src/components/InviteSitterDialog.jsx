import { useState } from 'react';
import { entities } from '@/api/entities';
import { supabase } from '@/api/supabaseClient';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { UserPlus, Trash2, Mail, CheckCircle2 } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';
import { isDemoAccount } from '@/lib/accountType';

export default function InviteSitterDialog({ petSitId, open, onOpenChange }) {
  const { user } = useAuth();
  const [email, setEmail] = useState('');
  const [saving, setSaving] = useState(false);
  const [accesses, setAccesses] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [error, setError] = useState('');

  const load = async () => {
    if (!petSitId) return;
    const data = await entities.PetSitterAccess.filter({ pet_sit_id: petSitId });
    setAccesses(data);
    setLoaded(true);
  };

  const handleOpenChange = (val) => {
    if (val && !loaded) load();
    if (!val) { setEmail(''); setSuccessMsg(''); setError(''); setLoaded(false); setAccesses([]); }
    onOpenChange(val);
  };

  const handleInvite = async (e) => {
    e.preventDefault();
    if (!email.trim() || !petSitId) return;
    setSaving(true);
    setSuccessMsg('');
    setError('');

    // Demo accounts don't invite sitters at all (spec 0026, out of scope
    // for the account's automatic per-login reset) — blocked here, before
    // creating any record, rather than relying on the reset to clean it up.
    if (isDemoAccount(user)) {
      setError("This isn't available on the demo account.");
      setSaving(false);
      return;
    }

    const { data: userData } = await supabase.auth.getUser();
    const me = userData?.user;
    const cleanEmail = email.trim().toLowerCase();
    // Check if already invited
    const existing = accesses.find(a => a.sitter_email === cleanEmail);
    if (!existing) {
      await entities.PetSitterAccess.create({
        pet_sit_id: petSitId,
        owner_id: me.id,
        sitter_email: cleanEmail,
      });

      // Send the invite email via the Edge Function.
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      const fnResp = await supabase.functions.invoke('invite-sitter', {
        body: { sitterEmail: cleanEmail, petSitId },
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      if (fnResp.error) {
        // Access record is already saved; just warn rather than block.
        console.error('invite-sitter function error:', fnResp.error);
        setSuccessMsg(`${cleanEmail} added as a sitter, but the invite email could not be sent. Try inviting them again — if it keeps failing, they can also use "Forgot password" on the login screen with this email.`);
      } else if (fnResp.data?.reason === 'test_or_demo_account') {
        setSuccessMsg(`${cleanEmail} added as a sitter. No real email was sent (test/demo accounts don't send production email) — they'll see this pet sit on their next login.`);
      } else if (fnResp.data?.reason === 'recipient_suppressed') {
        setSuccessMsg(`${cleanEmail} added as a sitter, but Wysker Watch couldn't email them — this address has previously failed to receive mail from us. They can still be reached another way to get set up with access.`);
      } else if (fnResp.data?.reason === 'exists') {
        setSuccessMsg(`${cleanEmail} already has a Whisker Watch account and can now see this pet sit.`);
      } else if (fnResp.data?.sent === false) {
        // Defensive fallback for a reason value not handled above (e.g. a
        // future suppression cause sendEmail() forgot to label) — see
        // InviteCoOwnerDialog.jsx's matching branch for the full rationale.
        setSuccessMsg(`${cleanEmail} added as a sitter, but no invite email was sent. Try inviting them again if this seems wrong.`);
      } else {
        setSuccessMsg(`Invite sent to ${cleanEmail}!`);
      }
    }
    setEmail('');
    setSaving(false);
    load();
  };

  const handleRemove = async (id) => {
    await entities.PetSitterAccess.delete(id);
    load();
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-2xl">Share with Sitter</DialogTitle>
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

        {error && <p className="text-sm text-destructive">{error}</p>}
        {successMsg && (
          <div className="flex items-start gap-2 text-sm text-emerald-500">
            <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

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