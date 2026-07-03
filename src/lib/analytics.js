import { supabase } from '@/api/supabaseClient';

// First-party event log (no third-party analytics provider is wired up
// yet). Fire-and-forget: a tracking failure must never block the feature
// it's instrumenting.
export async function track(eventName, properties = {}) {
  try {
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData?.user?.id;
    if (!userId) return;

    // Flag test/demo usage rather than dropping it, so it stays
    // debuggable but can be excluded from production analytics views.
    const { data: profile } = await supabase
      .from('profiles')
      .select('account_type')
      .eq('id', userId)
      .single();
    const accountType = profile?.account_type ?? 'production';

    const { error } = await supabase
      .from('analytics_events')
      .insert({ user_id: userId, event_name: eventName, properties: { ...properties, account_type: accountType } });
    if (error) throw error;
  } catch (err) {
    console.warn('[analytics] failed to track event', eventName, err);
  }
}
