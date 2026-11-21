import { describe, it, expect, vi, beforeEach } from 'vitest';

// A tiny stand-in for the Supabase client that records which ids were
// deleted and which were marked read, and can be told to fail.
const calls = { deleted: [], markedRead: [], fail: null };
function table() {
  return {
    delete: () => ({
      in: async (_col, ids) => {
        if (calls.fail === 'delete') return { error: new Error('delete failed') };
        calls.deleted.push(...ids);
        return { error: null };
      },
    }),
    update: () => ({
      in: async (_col, ids) => {
        if (calls.fail === 'update') return { error: new Error('update failed') };
        calls.markedRead.push(...ids);
        return { error: null };
      },
    }),
  };
}
vi.mock('@/api/supabaseClient', () => ({ supabase: { from: () => table() } }));
vi.mock('@/api/entities', () => ({ entities: {} }));

const { planClear, clearNotifications } = await import('./notificationClient');

const ownership = { id: 'n1', related_type: 'pet', read: false };
const reminder = { id: 'n2', related_type: 'vaccination_due', read: false };
const readNotice = { id: 'n3', related_type: null, read: true };

beforeEach(() => {
  calls.deleted = [];
  calls.markedRead = [];
  calls.fail = null;
});

// Spec 0076 (PA-58): vaccine reminders are marked read, never deleted,
// because the daily reminder job would otherwise send them again.
describe('planClear', () => {
  it('deletes ordinary notifications and marks vaccine reminders read', () => {
    expect(planClear([ownership, reminder, readNotice])).toEqual({
      deleteIds: ['n1', 'n3'],
      markReadIds: ['n2'],
    });
  });

  it('handles an empty list', () => {
    expect(planClear([])).toEqual({ deleteIds: [], markReadIds: [] });
  });
});

describe('clearNotifications', () => {
  it('deletes and marks read in one go', async () => {
    await clearNotifications([ownership, reminder]);
    expect(calls.deleted).toEqual(['n1']);
    expect(calls.markedRead).toEqual(['n2']);
  });

  it('skips the delete call when only reminders are cleared', async () => {
    await clearNotifications([reminder]);
    expect(calls.deleted).toEqual([]);
    expect(calls.markedRead).toEqual(['n2']);
  });

  it('throws when the delete fails, so the page can put the rows back', async () => {
    calls.fail = 'delete';
    await expect(clearNotifications([ownership])).rejects.toThrow('delete failed');
  });

  it('throws when marking read fails', async () => {
    calls.fail = 'update';
    await expect(clearNotifications([reminder])).rejects.toThrow('update failed');
  });
});
