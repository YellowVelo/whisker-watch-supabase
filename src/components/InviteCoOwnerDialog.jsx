import { useState, useEffect } from 'react';
import { entities } from '@/api/entities';
import { supabase } from '@/api/supabaseClient';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { UserPlus, Trash2, Mail, CheckCircle2 } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';
import { isDemoAccount } from '@/lib/accountType';
import { PALETTE } from '@/lib/toneColors';
import IconButton from '@/components/IconButton';

// Invite a co-owner (e.g. a spouse) to a pet. Unlike sitter access,
// a co-owner gets full owner-level rights: editing, logging, and
// deleting the pet, same as the original owner. Only the PRIMARY owner
// (pets.created_by) can add or remove co-owners — enforced by the
// database (migration 0056, spec 0072), not just by this UI. Co-owners
// open this dialog with `readOnly` to see the full list without the
// invite form or remove buttons.
export default function InviteCoOwnerDialog({ petId, petName, open, onOpenChange, readOnly = false }) {
  const { user } = useAuth();
  const [email, setEmail] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [coOwners, setCoOwners] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [removeConfirm, setRemoveConfirm] = useState(null);

  const load = async () => {
    if (!petId) return;
    const data = await entities.PetCoOwner.filter({ pet_id: petId });
    setCoOwners(data);
    setLoaded(true);
  };

  // Load whenever the parent opens the dialog. Radix only calls
  // onOpenChange for changes the dialog makes itself (closing), never when
  // the parent sets open=true, so loading from handleOpenChange meant the
  // list never appeared when opened from Edit Pet (found by spec 0072's e2e).
  useEffect(() => {
    if (open && petId) load();
  }, [open, petId]);

  const handleOpenChange = (val) => {
    if (!val) { setEmail(''); setError(''); setSuccessMsg(''); setLoaded(false); setCoOwners([]); setRemoveConfirm(null); }
    onOpenChange(val);
  };

  const handleInvite = async (e) => {
    e.preventDefault();
    if (!email.trim() || !petId) return;
    setSaving(true);
    setError('');
    setSuccessMsg('');

    // Demo accounts don't invite co-owners at all (spec 0026, out of scope
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

    if (cleanEmail === me.email.toLowerCase()) {
      setError("That's your own email.");
      setSaving(false);
      return;
    }
    const existing = coOwners.find(c => c.co_owner_email.toLowerCase() === cleanEmail);
    if (existing) {
      setError('Already a co-owner.');
      setSaving(false);
      return;
    }

    try {
      await entities.PetCoOwner.create({
        pet_id: petId,
        owner_id: me.id,
        co_owner_email: cleanEmail,
      });
    } catch (err) {
      // The database refuses anyone but the primary owner (migration 0056),
      // so a failure here must surface rather than leave the button stuck.
      console.error('PetCoOwner.create failed:', err);
      setError("We couldn't add that co-owner. Please try again.");
      setSaving(false);
      return;
    }

    // Send the invite email via the Edge Function.
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData?.session?.access_token;
    const fnResp = await supabase.functions.invoke('invite-co-owner', {
      body: { coOwnerEmail: cleanEmail, petName, petId },
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });

    if (fnResp.error) {
      // Access record is already saved; just warn rather than block. Note:
      // by this point the invite-co-owner function may have already
      // created the invitee's auth account (via generateLink) before the
      // email send itself failed, so they can't just "log in next time" —
      // point to a retry or Forgot Password instead of implying it'll
      // resolve on its own.
      console.error('invite-co-owner function error:', fnResp.error);
      setSuccessMsg(`${cleanEmail} added as co-owner, but the invite email could not be sent. Try inviting them again — if it keeps failing, they can also use "Forgot password" on the login screen with this email.`);
    } else if (fnResp.data?.reason === 'test_or_demo_account') {
      setSuccessMsg(`${cleanEmail} added as co-owner. No real email was sent (test/demo accounts don't send production email) — they'll see ${petName || 'the pet'} on their next login.`);
    } else if (fnResp.data?.reason === 'recipient_suppressed') {
      setSuccessMsg(`${cleanEmail} added as co-owner, but Wysker Watch couldn't email them — this address has previously failed to receive mail from us. They can still be reached another way to get set up with access.`);
    } else if (fnResp.data?.reason === 'exists') {
      // By this point invite-co-owner has already checked
      // email_has_password() and confirmed this is a genuinely
      // registered account, not just a stuck pending invite (those now
      // get a real re-invite email sent automatically instead of
      // landing here — see the Edge Function's header comment).
      setSuccessMsg(`${cleanEmail} already has a Whisker Watch account and can now see ${petName || 'this pet'}.`);
    } else if (fnResp.data?.sent === false) {
      // Defensive fallback for a reason value not handled above (e.g. a
      // future suppression cause sendEmail() forgot to label). Showing
      // this generic, honest copy is deliberately safer than falling
      // through to the "already has an account" message above, which
      // would be actively false for a case this branch doesn't recognize.
      setSuccessMsg(`${cleanEmail} added as co-owner, but no invite email was sent. Try inviting them again if this seems wrong.`);
    } else {
      setSuccessMsg(`Invite sent to ${cleanEmail}!`);
    }

    setEmail('');
    setSaving(false);
    load();
  };

  const handleRemove = async (id) => {
    setRemoveConfirm(null);
    try {
      await entities.PetCoOwner.delete(id);
    } catch (err) {
      console.error('PetCoOwner.delete failed:', err);
      setError("We couldn't remove that co-owner. Please try again.");
    }
    load();
  };

  return (
    <>
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-2xl">Share {petName ? `${petName}'s` : 'Pet'} Profile</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground -mt-1">
          {readOnly
            ? 'Only the primary owner can add or remove co-owners.'
            : `A co-owner gets full access — they can log symptoms, edit details, and manage everything for ${petName || 'this pet'}, just like you.`}
        </p>

        {!readOnly && <form onSubmit={handleInvite} className="flex gap-2 mt-1">
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
        </form>}
        {error && <p className="text-sm text-destructive">{error}</p>}
        {successMsg && (
          <div className="flex items-start gap-2 text-sm" style={{ color: PALETTE.teal }}>
            <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        {loaded && coOwners.length > 0 && (
          <div className="mt-2 space-y-2">
            <Label className="text-[13px] text-muted-foreground uppercase tracking-wide">Co-Owners</Label>
            {coOwners.map(c => (
              <div key={c.id} className="flex items-center justify-between bg-secondary rounded-lg px-3 py-2">
                <div className="flex items-center gap-2 min-w-0">
                  <Mail className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="text-sm break-all">{c.co_owner_email}</span>
                </div>
                {!readOnly && (
                  <IconButton
                    icon={Trash2}
                    aria-label={`Remove ${c.co_owner_email}`}
                    onClick={() => setRemoveConfirm(c)}
                    iconClassName="text-muted-foreground"
                  />
                )}
              </div>
            ))}
          </div>
        )}

        {loaded && coOwners.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-2">
            {readOnly ? 'No other co-owners.' : "No co-owners yet — it's just you."}
          </p>
        )}
      </DialogContent>
    </Dialog>

    <AlertDialog open={!!removeConfirm} onOpenChange={(v) => !v && setRemoveConfirm(null)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="text-2xl">Remove {removeConfirm?.co_owner_email} as a co-owner?</AlertDialogTitle>
          <AlertDialogDescription className="text-base leading-relaxed">
            They'll lose access to {petName ? `${petName}'s` : "this pet's"} profile and records right away. Anything they've already logged stays. You can invite them again later.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <Button variant="destructive" onClick={() => handleRemove(removeConfirm.id)}>Remove</Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}
