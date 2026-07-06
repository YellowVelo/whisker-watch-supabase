import { supabase } from '@/api/supabaseClient';

// Data-layer wrapper for account-management Edge Functions (Technical
// Standards: "Never call Supabase directly inside UI components" — the
// Menu screen's Delete Account / Reset Test Account actions go through
// here instead of calling supabase.functions.invoke directly).
async function invokeWithAuth(functionName) {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData?.session?.access_token;
  return supabase.functions.invoke(functionName, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
}

export function deleteAccount() {
  return invokeWithAuth('delete-account');
}

export function resetTestAccount() {
  return invokeWithAuth('reset-test-account');
}

// Best-effort sign-out used after a successful account deletion — the
// auth row is already gone server-side at that point, so a failure here
// must never block navigating the user away.
export async function signOutBestEffort() {
  try {
    await supabase.auth.signOut();
  } catch {
    // intentionally ignored — see comment above
  }
}
