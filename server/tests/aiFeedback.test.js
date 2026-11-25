import { describe, it, expect } from 'vitest';
import { compareScans, diffScans, dailyTrend, feedbackSchema, summariseFeedback, topWords } from '../services/aiFeedback.js';

const row = (rating, source, ruleId, extra = {}) => ({
  rating, reason: null, comment: null, createdAt: '2026-11-18T10:00:00Z', explanation: { source, finding: { ruleId } }, ...extra,
});

describe('summariseFeedback', () => {
  it('returns zeros and a null rate when there is no feedback', () => {
    const s = summariseFeedback([]);
    expect(s.total).toBe(0);
    expect(s.helpfulRate).toBeNull();
    expect(s.worstRules).toEqual([]);
  });

  it('counts by rating, by source, by reason and ranks the worst rules', () => {
    const s = summariseFeedback([
      row('HELPFUL', 'LLM', 'image-alt'),
      row('NOT_HELPFUL', 'LLM', 'label', { reason: 'WRONG_FIX', comment: 'did not work' }),
      row('NOT_HELPFUL', 'LLM', 'label', { reason: 'TOO_VAGUE' }),
      row('NOT_HELPFUL', 'AXE_FALLBACK', 'link-name', { reason: 'WRONG_FIX' }),
    ]);
    expect(s).toMatchObject({ total: 4, helpful: 1, notHelpful: 3, helpfulRate: 0.25 });
    expect(s.bySource.LLM).toEqual({ helpful: 1, notHelpful: 2 });
    expect(s.bySource.AXE_FALLBACK).toEqual({ helpful: 0, notHelpful: 1 });
    expect(s.reasons).toEqual({ WRONG_FIX: 2, TOO_VAGUE: 1 });
    expect(s.worstRules[0]).toEqual({ ruleId: 'label', helpful: 0, notHelpful: 2 });
    expect(s.recentComments).toHaveLength(1);
  });
});

describe('feedbackSchema', () => {
  it('accepts a rating and trims the comment', () => {
    expect(feedbackSchema.parse({ rating: 'NOT_HELPFUL', reason: 'TOO_VAGUE', comment: '  hi ' }))
      .toEqual({ rating: 'NOT_HELPFUL', reason: 'TOO_VAGUE', comment: 'hi' });
  });
  it('rejects unknown ratings, unknown reasons, extra fields and long comments', () => {
    expect(feedbackSchema.safeParse({ rating: 'MEH' }).success).toBe(false);
    expect(feedbackSchema.safeParse({ rating: 'NOT_HELPFUL', reason: 'BECAUSE' }).success).toBe(false);
    expect(feedbackSchema.safeParse({ rating: 'HELPFUL', admin: true }).success).toBe(false);
    expect(feedbackSchema.safeParse({ rating: 'HELPFUL', comment: 'x'.repeat(501) }).success).toBe(false);
  });
});

describe('compareScans', () => {
  it('has no comparison without a previous scan', () => {
    expect(compareScans([{ ruleId: 'a', nodeCount: 1 }], [], null)).toEqual({ comparison: null, changes: {} });
  });
  it('classifies rules as new, worse, improved or same and lists resolved rules', () => {
    const { comparison, changes } = compareScans(
      [{ ruleId: 'a', nodeCount: 1 }, { ruleId: 'b', nodeCount: 5 }, { ruleId: 'c', nodeCount: 2 }, { ruleId: 'd', nodeCount: 1 }],
      [{ ruleId: 'a', nodeCount: 3 }, { ruleId: 'b', nodeCount: 2 }, { ruleId: 'c', nodeCount: 2 }, { ruleId: 'gone', nodeCount: 1 }],
      7,
    );
    expect(changes.a.change).toBe('IMPROVED');
    expect(changes.b.change).toBe('WORSE');
    expect(changes.c.change).toBe('SAME');
    expect(changes.d.change).toBe('NEW');
    expect(comparison).toEqual({ previousScanId: 7, resolved: ['gone'], new: 1, worse: 1, improved: 1, same: 1 });
  });
});

describe('feedback trend and complaint words', () => {
  it('groups ratings by day, oldest first, with a helpful rate', () => {
    const t = dailyTrend([
      row('HELPFUL', 'LLM', 'a', { createdAt: '2026-11-18T10:00:00Z' }),
      row('NOT_HELPFUL', 'LLM', 'a', { createdAt: '2026-11-17T23:00:00Z' }),
      row('HELPFUL', 'LLM', 'a', { createdAt: '2026-11-18T01:00:00Z' }),
    ]);
    expect(t).toEqual([
      { date: '2026-11-17', helpful: 0, notHelpful: 1, total: 1, rate: 0 },
      { date: '2026-11-18', helpful: 2, notHelpful: 0, total: 2, rate: 1 },
    ]);
  });

  it('keeps only the most recent days', () => {
    const rows = Array.from({ length: 40 }, (_, i) => row('HELPFUL', 'LLM', 'a', { createdAt: new Date(Date.UTC(2026, 9, 1 + i)).toISOString() }));
    expect(dailyTrend(rows, 30)).toHaveLength(30);
  });

  it('lists common words from comments without filler words, counting a word once per comment', () => {
    const words = topWords(['The fix does not work, the code is broken', 'Code broken broken broken', 'Too vague to act on']);
    expect(words[0]).toEqual({ word: 'broken', count: 2 });
    expect(words.find((w) => w.word === 'code')).toEqual({ word: 'code', count: 2 });
    expect(words.some((w) => w.word === 'the' || w.word === 'not')).toBe(false);
  });

  it('puts trend and complaint words in the admin summary, using only negative comments for words', () => {
    const s = summariseFeedback([
      row('NOT_HELPFUL', 'LLM', 'label', { reason: 'WRONG_FIX', comment: 'selector wrong' }),
      row('HELPFUL', 'LLM', 'label', { comment: 'selector perfect' }),
    ]);
    expect(s.trend).toHaveLength(1);
    expect(s.complaintWords.map((w) => w.word)).toEqual(['selector', 'wrong']);
  });
});

describe('diffScans', () => {
  const f = (ruleId, nodeCount, priority) => ({ ruleId, nodeCount, help: `${ruleId} help`, axeImpact: 'SERIOUS', prediction: priority ? { priority } : null });

  it('separates fixed, new and unchanged rules and sorts by priority', () => {
    const d = diffScans(
      [f('gone-low', 1, 'LOW'), f('gone-high', 2, 'HIGH'), f('stay', 3, 'MEDIUM')],
      [f('stay', 1, 'MEDIUM'), f('fresh', 4, 'HIGH')],
    );
    expect(d.fixed.map((x) => x.ruleId)).toEqual(['gone-high', 'gone-low']);
    expect(d.fixed[0]).toMatchObject({ before: 2, after: 0, priority: 'HIGH' });
    expect(d.new).toEqual([expect.objectContaining({ ruleId: 'fresh', before: 0, after: 4 })]);
    expect(d.unchanged).toEqual([expect.objectContaining({ ruleId: 'stay', before: 3, after: 1 })]);
  });

  it('handles two clean scans', () => {
    expect(diffScans([], [])).toEqual({ fixed: [], new: [], unchanged: [] });
  });
});
