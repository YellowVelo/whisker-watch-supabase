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

export async function snoozeNotification(id) {
  const snoozed_until = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  return entities.Notification.update(id, { read: true, snoozed_until });
}

// ── Clearing (spec 0076, PA-58) ─────────────────────────────────────
// A vaccination-due reminder is never deleted: the daily reminder job
// (migration 0044) decides "already sent" by finding the existing row, so
// deleting it would make the same reminder come back the next day. It's
// marked read instead, which the Notifications page already treats as
// gone. Every other notification is deleted. RLS
// (notifications_delete_own / notifications_update_own, migration 0005)
// scopes all of these to the signed-in person's own rows.
export function planClear(rows) {
  const deleteIds = [];
  const markReadIds = [];
  for (const row of rows) {
    if (row.related_type === 'vaccination_due') markReadIds.push(row.id);
    else deleteIds.push(row.id);
  }
  return { deleteIds, markReadIds };
}

export async function clearNotifications(rows) {
  const { deleteIds, markReadIds } = planClear(rows);
  const [deleted, marked] = await Promise.all([
    deleteIds.length
      ? supabase.from('notifications').delete().in('id', deleteIds)
      : { error: null },
    markReadIds.length
      ? supabase.from('notifications').update({ read: true }).in('id', markReadIds)
      : { error: null },
  ]);
  if (deleted.error) throw deleted.error;
  if (marked.error) throw marked.error;
}

export async function markAllRead() {
  const { error } = await supabase.from('notifications').update({ read: true }).eq('read', false);
  if (error) throw error;
}
