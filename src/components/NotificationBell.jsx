import { Bell } from 'lucide-react';
import { PALETTE } from '@/lib/toneColors';
import IconButton from '@/components/IconButton';

// Notification entry point for Home. Badge only renders when unread
// notifications exist; hidden otherwise (per Home Feature Spec #2).
// Design System Amendment #11 (2026-07-30) — shares the same IconButton
// component as every other circular icon button, no "header action" exception.
export default function NotificationBell({ unreadCount }) {
  return (
    <IconButton
      to="/notifications"
      aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'}
      icon={Bell}
      iconClassName="text-tier-secondary"
    >
      {unreadCount > 0 && (
        <span
          className="absolute top-1.5 right-1.5 h-2.5 w-2.5 rounded-full"
          style={{ background: PALETTE.sky, boxShadow: '0 0 0 2px hsl(var(--background))' }}
          aria-hidden="true"
        />
      )}
    </IconButton>
  );
}
