// Notifications data layer. Thin wrapper around entities.Notification so
// components never touch the table shape directly (Technical Standards:
// "all data access goes through entityClient.js and entities.js").

import { entities } from '@/api/entities';
import { supabase } from '@/api/supabaseClient';

// Uses a count-only query (head: true) rather than entities.Notification
// .filter(), which would fetch every unread row's full payload just to
// read its length — same "avoid unnecessary reads" rationale as the
// batched queries in checkinClient.js. RLS already scopes this to the
// signed-in user's own rows.
export async function getUnreadCount() {
  const { count, error } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('read', false);
  if (error) throw error;
  return count ?? 0;
}

export async function listNotifications() {
  return entities.Notification.list('-created_at');
}

export async function markRead(id) {
  return entities.Notification.update(id, { read: true });
}
