import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Bell, Syringe } from 'lucide-react';
import IconButton from '../components/IconButton';
import PageTransition from '../components/PageTransition';
import { Button } from '@/components/ui/button';
import { entities } from '@/api/entities';
import { PALETTE } from '@/lib/toneColors';
import { listNotifications, markRead, snoozeNotification } from '@/lib/notifications/notificationClient';

const VACCINATION_STAGE_TITLE = {
  '30_day': 'Vaccination Due Soon',
  '14_day': 'Vaccination Due Soon',
  '7_day': 'Vaccination Due Soon',
  '3_day': 'Vaccination Due Soon',
  due_today: 'Vaccination Due Today',
  overdue: 'Vaccination Overdue',
};

export default function Notifications() {
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actingOn, setActingOn] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setNotifications(await listNotifications());
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // A vaccination-due reminder is a live, time-bound nudge, not a
  // permanent record — once acted on (View/Update or Snooze both mark it
  // read), it should disappear rather than linger with stale wording
  // until the next escalation stage replaces it. Other notification
  // types (e.g. ownership transfer) keep their existing read-but-visible
  // history behavior.
  const visibleNotifications = notifications.filter(
    (n) => n.related_type !== 'vaccination_due' || !n.read
  );

  const handleTap = async (notification) => {
    if (notification.related_type === 'vaccination_due') return; // handled by its own buttons
    if (notification.read) return;
    setNotifications((rows) => rows.map((r) => (r.id === notification.id ? { ...r, read: true } : r)));
    await markRead(notification.id);
  };

  const handleViewVaccination = async (notification) => {
    setActingOn(notification.id);
    try {
      if (!notification.read) {
        setNotifications((rows) => rows.map((r) => (r.id === notification.id ? { ...r, read: true } : r)));
        await markRead(notification.id);
      }
      const vaccination = await entities.Vaccination.get(notification.related_id);
      navigate(`/pet/${vaccination.pet_id}/vaccinations?edit=${notification.related_id}`);
    } finally {
      setActingOn(null);
    }
  };

  const handleSnooze = async (notification) => {
    setActingOn(notification.id);
    try {
      setNotifications((rows) => rows.map((r) => (r.id === notification.id ? { ...r, read: true } : r)));
      await snoozeNotification(notification.id);
    } finally {
      setActingOn(null);
    }
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
          ) : visibleNotifications.length === 0 ? (
            <div className="text-center py-20">
              <Bell className="h-8 w-8 mx-auto mb-3 text-muted-foreground" />
              <p className="text-base text-muted-foreground">No notifications yet.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {visibleNotifications.map((n) => {
                const isVaccination = n.related_type === 'vaccination_due';
                const rowClass = `w-full text-left rounded-xl px-4 py-3.5 border border-border ${n.read ? 'bg-card' : 'bg-accent/8'}`;

                if (isVaccination) {
                  const title = VACCINATION_STAGE_TITLE[n.stage] || 'Vaccination Due';
                  const busy = actingOn === n.id;
                  return (
                    <div key={n.id} className={rowClass}>
                      <div className="flex items-start gap-3">
                        <div
                          className="shrink-0 h-9 w-9 rounded-full flex items-center justify-center"
                          style={{ background: 'color-mix(in srgb, ' + PALETTE.sky + ' 15%, transparent)' }}
                        >
                          <Syringe className="h-4 w-4" style={{ color: PALETTE.sky }} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-base font-medium">{title}</p>
                          <p className="text-base text-tier-secondary mt-0.5">{n.message}</p>
                          <p className="text-sm text-tier-tertiary mt-1">{new Date(n.created_at).toLocaleString()}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 mt-3">
                        <Button size="sm" disabled={busy} onClick={() => handleViewVaccination(n)}>
                          {n.stage === 'overdue' ? 'Update Vaccination' : 'View Vaccination'}
                        </Button>
                        <Button size="sm" variant="outline" disabled={busy} onClick={() => handleSnooze(n)}>
                          Snooze 7 Days
                        </Button>
                      </div>
                    </div>
                  );
                }

                return (
                  <button
                    key={n.id}
                    onClick={() => handleTap(n)}
                    className={`${rowClass} transition-opacity active:opacity-70`}
                  >
                    <p className="text-base text-tier-secondary">{n.message}</p>
                    <p className="text-sm text-tier-tertiary mt-1">{new Date(n.created_at).toLocaleString()}</p>
                  </button>
                );
              })}
            </div>
          )}
        </main>
      </div>
    </PageTransition>
  );
}
