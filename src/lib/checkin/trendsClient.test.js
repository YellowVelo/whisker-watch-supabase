import { describe, it, expect, vi, beforeEach } from 'vitest';

const state = { checkIns: [], aiAnswer: {} };
const invokeAI = vi.fn(async () => state.aiAnswer);

vi.mock('@/api/supabaseClient', () => ({ supabase: {} }));
vi.mock('@/api/entities', () => ({
  entities: { DailyCheckIn: { filter: async () => state.checkIns } },
}));
vi.mock('@/api/aiClient', () => ({ invokeAI: (...args) => invokeAI(...args) }));

const { getInsightSummary } = await import('./trendsClient');

const PET_ID = '0b6f1c1e-2a3b-4c5d-8e9f-0a1b2c3d4e5f';
const days = (...statuses) => statuses.map((status) => ({ status }));

beforeEach(() => {
  invokeAI.mockClear();
  state.checkIns = days('great', 'off');
  state.aiAnswer = { summary: 'Appetite dipped a little this week.' };
});

describe('getInsightSummary (spec 0080: trends_summary task)', () => {
  it('sends only the task, the pet id and the range', async () => {
    await getInsightSummary(PET_ID, '7D');
    expect(invokeAI).toHaveBeenCalledTimes(1);
    expect(invokeAI).toHaveBeenCalledWith({ task: 'trends_summary', pet_id: PET_ID, range: '7D' });
  });

  it('returns the summary the server sends back', async () => {
    expect(await getInsightSummary(PET_ID, '30D')).toBe('Appetite dipped a little this week.');
  });

  it('returns null when the server answers { summary: null }', async () => {
    state.aiAnswer = { summary: null };
    expect(await getInsightSummary(PET_ID, '30D')).toBeNull();
  });

  it('returns null without asking the server when fewer than 2 check-ins are not skipped', async () => {
    state.checkIns = days('great', 'skipped', 'skipped');
    expect(await getInsightSummary(PET_ID, '30D')).toBeNull();
    expect(invokeAI).not.toHaveBeenCalled();
  });

  it('throws when the AI call fails, so the card can show "Insights unavailable."', async () => {
    invokeAI.mockRejectedValueOnce(Object.assign(new Error('AI request failed'), { status: 502 }));
    await expect(getInsightSummary(PET_ID, '30D')).rejects.toThrow('AI request failed');
  });
});

describe('observationDaySeries (spec 0080: the Trends cards per-day rule)', () => {
  it('collects symptom labels per check-in, skipping baseline, not-observed and skipped-day answers', async () => {
    const { observationDaySeries } = await import('./observationSeries');
    const labels = { ate_little_less: 'Ate a little less', ate_more: 'Ate more' };
    const { symptomLabelsByCheckIn } = observationDaySeries(
      [{ id: 'a', check_in_date: '2026-11-01', status: 'off' }, { id: 's', check_in_date: '2026-11-02', status: 'skipped' }],
      [
        { daily_check_in_id: 'a', value: 'ate_little_less' },
        { daily_check_in_id: 'a', value: 'ate_more' },
        { daily_check_in_id: 'a', value: 'normal' },
        { daily_check_in_id: 'a', value: 'not_observed' },
        { daily_check_in_id: 's', value: 'ate_more' },
      ],
      (v) => labels[v] || v,
    );
    expect(symptomLabelsByCheckIn).toEqual({ a: ['Ate a little less', 'Ate more'] });
  });
});
