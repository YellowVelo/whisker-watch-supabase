import { supabase } from '@/api/supabaseClient';
import { isDemoAccount } from '@/lib/accountType';
import { toast } from '@/components/ui/use-toast';

// Thrown by assertNotDemoAccount below. A dedicated class (rather than a
// plain Error) lets any future caller recognize this specific case with
// `instanceof`, though today nothing needs to — the toast is already fired
// before this is thrown, so callers just need the promise to reject.
export class DemoAccountBlockedError extends Error {}

// account_type rarely changes mid-session, and writes can happen often —
// cache it per user instead of re-querying profiles on every single write.
// Mirrors the accountTypeCache pattern in src/lib/analytics.js.
const accountTypeCache = new Map(); // userId -> { accountType, fetchedAt }
const ACCOUNT_TYPE_CACHE_TTL_MS = 5 * 60 * 1000;

// Demo accounts (account_type = 'demo') can view everything but must never
// write. Shared by every write path that isn't already covered by
// entityClient.js's own use of this same guard — currently
// src/lib/checkin/checkinClient.js's save_daily_check_ins RPC calls, which
// bypass entityClient.js entirely (Technical Standards' one documented
// exception to "all data access goes through entityClient.js"). Returns the
// caller's user id so callers needing it for created_by don't have to fetch
// it twice.
export async function assertNotDemoAccount() {
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData?.user?.id;
  if (!userId) return userId;

  let accountType;
  const cached = accountTypeCache.get(userId);
  if (cached && Date.now() - cached.fetchedAt < ACCOUNT_TYPE_CACHE_TTL_MS) {
    accountType = cached.accountType;
  } else {
    const { data: profile } = await supabase
      .from('profiles')
      .select('account_type')
      .eq('id', userId)
      .single();
    accountType = profile?.account_type ?? 'production';
    accountTypeCache.set(userId, { accountType, fetchedAt: Date.now() });
  }

  if (isDemoAccount({ account_type: accountType })) {
    toast({ variant: 'destructive', description: "This is a demo — changes aren't saved here." });
    throw new DemoAccountBlockedError('Demo accounts cannot write data');
  }

  return userId;
}
