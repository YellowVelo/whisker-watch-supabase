import { useNavigate } from 'react-router-dom';
import { Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';

// Shown in place of an owner-only screen (Edit Pet, Vet Report) when the
// signed-in person only sits for this pet (spec 0076, PA-28). Sitters
// never get a button to these pages; this covers someone typing the
// address. The database already refuses a sitter's changes; this just
// says so up front instead of failing on Save.
export default function OwnersOnlyNotice() {
  const navigate = useNavigate();
  return (
    <div className="text-center py-16 px-4" role="status">
      <Lock className="h-8 w-8 mx-auto mb-3 text-muted-foreground" aria-hidden="true" />
      <p className="text-base text-tier-secondary mb-5">Only this pet&apos;s owners can do this.</p>
      <Button variant="outline" onClick={() => navigate(-1)}>Back</Button>
    </div>
  );
}
