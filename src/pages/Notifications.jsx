import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Bell, Syringe, X } from 'lucide-react';
import IconButton from '../components/IconButton';
import PageTransition from '../components/PageTransition';
import BottomSheet from '../components/BottomSheet';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { entities } from '@/api/entities';
import { PALETTE } from '@/lib/toneColors';
import {
  listNotifications,
  markRead,
  snoozeNotification,
  clearNotifications,
  markAllRead,
} from '@/lib/notifications/notificationClient';

const VACCINATION_STAGE_TITLE = {
  '30_day': 'Vaccination Due Soon',
  '14_day': 'Vaccination Due Soon',
  '7_day': 'Vaccination Due Soon',
  '3_day': 'Vaccination Due Soon',
  due_today: 'Vaccination Due Today',
  overdue: 'Vaccination Overdue',
};

const UPDATE_ERROR_TEXT = "Couldn't update your notifications. Please try again.";

export default function Notifications() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [actingOn, setActingOn] = useState(null);
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setNotifications(await listNotifications());
      setLoadError(false);
    } catch (err) {
      console.error(err);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // A vaccination-due reminder is a live, time-bound nudge, not a
  // permanent record — once acted on (View/Update, Snooze, Dismiss or
  // Clear all all mark it read), it should disappear rather than linger
  // with stale wording until the next escalation stage replaces it. Other
  // notification types (e.g. ownership transfer) keep their existing
  // read-but-visible history behavior until dismissed or cleared.
  const visibleNotifications = notifications.filter(
    (n) => n.related_type !== 'vaccination_due' || !n.read
  );
  const hasUnread = visibleNotifications.some((n) => !n.read);

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

  // Dismiss one / Clear all / Mark all read (spec 0076, PA-58). Each
  // updates the list straight away and puts it back if the save fails.
  // Clearing deletes a notification, except a vaccine reminder, which is
  // marked read instead (see planClear in notificationClient.js).
  const applyOptimistic = async (nextRows, save) => {
    const previous = notifications;
    setNotifications(nextRows);
    try {
      await save();
    } catch (err) {
      console.error(err);
      setNotifications(previous);
      toast({ variant: 'destructive', description: UPDATE_ERROR_TEXT });
    }
  };

  const handleDismiss = (notification) => applyOptimistic(
    notifications.filter((r) => r.id !== notification.id),
    () => clearNotifications([notification]),
  );

  const handleClearAll = () => {
    setConfirmClearOpen(false);
    const toClear = visibleNotifications;
    const clearedIds = new Set(toClear.map((r) => r.id));
    return applyOptimistic(
      notifications.filter((r) => !clearedIds.has(r.id)),
      () => clearNotifications(toClear),
    );
  };

  const handleMarkAllRead = () => applyOptimistic(
    notifications.map((r) => ({ ...r, read: true })),
    () => markAllRead(),
  );

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
                <div key={i} className="h-16 rounded-xl animate-pulse bg-card" />
              ))}
            </div>
          ) : loadError ? (
            <div className="text-center py-20">
              <p className="text-base text-muted-foreground mb-4">We couldn&apos;t load your notifications.</p>
              <Button variant="outline" onClick={load}>Try again</Button>
            </div>
          ) : visibleNotifications.length === 0 ? (
            <div className="text-center py-20">
              <Bell className="h-8 w-8 mx-auto mb-3 text-muted-foreground" />
              <p className="text-base text-muted-foreground">No notifications yet.</p>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center justify-end gap-1">
                {hasUnread && (
                  <Button variant="ghost" size="sm" className="min-h-11" onClick={handleMarkAllRead}>
                    Mark all read
                  </Button>
                )}
                <Button variant="ghost" size="sm" className="min-h-11" onClick={() => setConfirmClearOpen(true)}>
                  Clear all
                </Button>
              </div>
              {visibleNotifications.map((n) => {
                const isVaccination = n.related_type === 'vaccination_due';
                const rowClass = `w-full text-left rounded-xl px-4 py-3.5 border border-border ${n.read ? 'bg-card' : 'bg-accent/8'}`;

                if (isVaccination) {
                  const title = VACCINATION_STAGE_TITLE[n.stage] || 'Vaccination Due';
                  const busy = actingOn === n.id;
                  return (
                    <div key={n.id} className={rowClass} data-testid="notification-row">
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
                        <IconButton
                          variant="plain"
                          icon={X}
                          iconClassName="h-4 w-4 text-muted-foreground"
                          className="-mt-2 -mr-2"
                          aria-label={`Dismiss: ${n.message}`}
                          disabled={busy}
                          onClick={() => handleDismiss(n)}
                        />
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

                // A div, not one big <button>, so the dismiss "x" isn't a
                // button nested inside a button (invalid HTML).
                return (
                  <div key={n.id} className={`${rowClass} flex items-start gap-2`} data-testid="notification-row">
                    <button
                      type="button"
                      onClick={() => handleTap(n)}
                      className="min-w-0 flex-1 text-left transition-opacity active:opacity-70"
                    >
                      <p className="text-base text-tier-secondary">{n.message}</p>
                      <p className="text-sm text-tier-tertiary mt-1">{new Date(n.created_at).toLocaleString()}</p>
                    </button>
                    <IconButton
                      variant="plain"
                      icon={X}
                      iconClassName="h-4 w-4 text-muted-foreground"
                      className="-my-2 -mr-2"
                      aria-label={`Dismiss: ${n.message}`}
                      onClick={() => handleDismiss(n)}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </main>
      </div>
      {confirmClearOpen && (
        <BottomSheet
          titleId="clear-notifications-title"
          title="Clear all notifications?"
          onClose={() => setConfirmClearOpen(false)}
          footer={(
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setConfirmClearOpen(false)}>Cancel</Button>
              <Button className="flex-1" onClick={handleClearAll}>Clear all</Button>
            </div>
          )}
        >
          {null}
        </BottomSheet>
      )}
    </PageTransition>
  );
}
