// Shared invite-email rate limit (spec 0077, punch list PA-10).
//
// invite-co-owner and invite-sitter share ONE budget per person: 10 invite
// requests per hour, across both functions. Every request that gets past the
// login check counts, including ones later refused (no matching invite, not
// the owner), so the functions can't be used to probe at scale.
//
// Reuses check_and_record_rate_limit (migration 0039), the same mechanism as
// ask-vet-assistant (spec 0050). That RPC is service-role only, so callers
// pass their service-role client.

import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2.119.2';

export const INVITE_RATE_LIMIT = 10;
export const INVITE_RATE_WINDOW_SECONDS = 60 * 60;

export type InviteRateLimitResult = 'allowed' | 'limited' | 'unavailable';

export async function checkInviteRateLimit(
  adminClient: SupabaseClient,
  userId: string,
): Promise<InviteRateLimitResult> {
  const { data, error } = await adminClient.rpc('check_and_record_rate_limit', {
    p_key: `invite-email:user:${userId}`,
    p_limit: INVITE_RATE_LIMIT,
    p_window_seconds: INVITE_RATE_WINDOW_SECONDS,
  });
  if (error) {
    // Fail closed, same as ask-vet-assistant: if the limiter itself is down,
    // don't send email.
    console.error('invite rate limit check failed:', error.message);
    return 'unavailable';
  }
  return data === true ? 'allowed' : 'limited';
}
