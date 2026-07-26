// Shared "is this Supabase Auth admin error an already-registered-email
// error" heuristic — used by every Edge Function that calls
// admin.generateLink()/admin.createUser() and needs to tell "this email
// already has an auth.users row" apart from a genuine failure. Factored
// out so a fix to this heuristic (e.g. if a future Supabase version
// changes the error shape) only needs to happen in one place instead of
// once per caller (invite-co-owner, invite-sitter, sign-up).
export function isAlreadyRegisteredError(error: { message?: string; status?: number } | null | undefined): boolean {
  return !!error && (error.message?.toLowerCase().includes('already registered') || error.status === 422);
}
