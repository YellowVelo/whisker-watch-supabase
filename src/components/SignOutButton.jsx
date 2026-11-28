import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/AuthContext';
import { cn } from '@/lib/utils';

// The outline Sign out button under the consent and finish-setup forms
// (spec 0086): /verify-email, /accept-invite and ConsentGate. Uses
// AuthContext's logout(), which signs out and goes to /login.
export default function SignOutButton({ className = undefined }) {
  const { logout } = useAuth();
  return (
    <Button type="button" variant="outline" className={cn('w-full mt-3', className)} onClick={logout}>
      Sign out
    </Button>
  );
}
