// Shared by InviteCoOwnerDialog.jsx and InviteSitterDialog.jsx (spec 0077).
//
// invite-co-owner and invite-sitter reply 429 when someone has sent too many
// invites in the last hour (_shared/inviteRateLimit.ts). supabase-js turns any
// non-2xx reply into a FunctionsHttpError whose `context` is the raw Response,
// so the status is read from there.
export function isRateLimited(fnError) {
  return fnError?.context?.status === 429;
}
