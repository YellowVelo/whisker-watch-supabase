import { useEffect, useState } from 'react';
import { Heart } from 'lucide-react';
import NotificationBell from './NotificationBell';
import AskWyskerAction from './AskWyskerAction';
import { getUnreadCount } from '@/lib/notifications/notificationClient';
import { Z } from '@/lib/zIndex';

// Persistent App Shell header (spec 0023 steps 3+5): brand identity, Ask
// Wysker, and notifications — visible on every screen AppShell wraps.
// Fetches its own unread count independently of any one page — previously
// this was Home-only state passed into NotificationBell as a prop.
export default function AppHeader() {
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    getUnreadCount().then(setUnreadCount).catch(() => {});
  }, []);

  return (
    <header
      className={`sticky top-0 ${Z.chrome} backdrop-blur-xl border-b border-border bg-background/90`}
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
      <div className="max-w-2xl mx-auto px-4 h-14 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
            <Heart className="h-4 w-4 text-primary" />
          </div>
          <span className="text-lg font-semibold truncate">Wysker Watch</span>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <AskWyskerAction />
          <NotificationBell unreadCount={unreadCount} />
        </div>
      </div>
    </header>
  );
}
