import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Bell } from 'lucide-react';
import IconButton from '../components/IconButton';
import PageTransition from '../components/PageTransition';
import { listNotifications, markRead } from '@/lib/notifications/notificationClient';

export default function Notifications() {
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setNotifications(await listNotifications());
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleTap = async (notification) => {
    if (notification.read) return;
    setNotifications((rows) => rows.map((r) => (r.id === notification.id ? { ...r, read: true } : r)));
    await markRead(notification.id);
  };

  return (
    <PageTransition>
      <div className="min-h-screen pb-24">
        <header style={{ paddingTop: 'env(safe-area-inset-top)' }}>
          <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-3">
            <IconButton icon={ChevronLeft} onClick={() => navigate(-1)} aria-label="Back" />
            <h1 className="text-[28px] font-semibold">Notifications</h1>
          </div>
        </header>

        <main className="max-w-2xl mx-auto px-4 py-2">
          {loading ? (
            <div className="space-y-2">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-16 rounded-xl animate-pulse" style={{ background: 'rgba(255,255,255,0.04)' }} />
              ))}
            </div>
          ) : notifications.length === 0 ? (
            <div className="text-center py-20">
              <Bell className="h-8 w-8 mx-auto mb-3 text-muted-foreground" />
              <p className="text-base text-muted-foreground">No notifications yet.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {notifications.map((n) => (
                <button
                  key={n.id}
                  onClick={() => handleTap(n)}
                  className={`w-full text-left rounded-xl px-4 py-3.5 transition-opacity active:opacity-70 border border-border ${n.read ? 'bg-card' : ''}`}
                  style={n.read ? undefined : { background: 'rgba(111,183,255,0.08)' }}
                >
                  <p className="text-base text-tier-secondary">{n.message}</p>
                  <p className="text-sm text-tier-tertiary mt-1">{new Date(n.created_at).toLocaleString()}</p>
                </button>
              ))}
            </div>
          )}
        </main>
      </div>
    </PageTransition>
  );
}
