import { Link } from 'react-router-dom';
import { Bell } from 'lucide-react';
import { PALETTE } from '@/lib/toneColors';

// Notification entry point for Home. Badge only renders when unread
// notifications exist; hidden otherwise (per Home Feature Spec #2).
export default function NotificationBell({ unreadCount }) {
  return (
    <Link
      to="/notifications"
      aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'}
      className="relative h-11 w-11 rounded-full flex items-center justify-center flex-shrink-0 active:opacity-70 transition-opacity"
      style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}
    >
      <Bell className="h-5 w-5 text-white/80" />
      {unreadCount > 0 && (
        <span
          className="absolute top-1.5 right-1.5 h-2.5 w-2.5 rounded-full"
          style={{ background: PALETTE.sky, boxShadow: '0 0 0 2px hsl(var(--background))' }}
          aria-hidden="true"
        />
      )}
    </Link>
  );
}
