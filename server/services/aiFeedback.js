import { z } from 'zod';

export const FEEDBACK_REASONS = ['WRONG_FIX', 'NOT_APPLICABLE', 'TOO_VAGUE', 'CODE_DOES_NOT_WORK', 'OTHER'];

// Validates what a user sends when rating one explanation. Free text is trimmed and length-limited; it is only ever
// displayed as plain text (React escapes it), never executed or sent to the LLM.
export const feedbackSchema = z
  .object({
    rating: z.enum(['HELPFUL', 'NOT_HELPFUL'], { message: 'Rating must be HELPFUL or NOT_HELPFUL' }),
    reason: z.enum(FEEDBACK_REASONS, { message: 'Unknown reason' }).optional(),
    comment: z.string().trim().max(500, 'Comment is too long (500 characters max)').optional(),
  })
  .strict()
  .transform((v) => ({
    rating: v.rating,
    // A reason only makes sense for a negative rating.
    reason: v.rating === 'NOT_HELPFUL' ? (v.reason ?? null) : null,
    comment: v.comment ? v.comment : null,
  }));

const emptyBucket = () => ({ helpful: 0, notHelpful: 0 });

const STOP_WORDS = new Set(
  ('the and for that this with was are not but you your have has had its it\'s can could would should did does don\'t doesn\'t ' +
    'from they them there then than into out any all too very just more some what when which who how why also one use used ' +
    'about because still only like get got make need').split(/\s+/),
);

/** The most common words in free-text comments, for a quick read of what people complain about. */
export function topWords(comments, limit = 20) {
  const counts = new Map();
  for (const text of comments) {
    const seen = new Set(); // a word repeated inside one comment counts once, so one long rant cannot dominate
    for (const word of String(text).toLowerCase().split(/[^a-z']+/)) {
      const w = word.replace(/^'+|'+$/g, '');
      if (w.length < 3 || STOP_WORDS.has(w) || seen.has(w)) continue;
      seen.add(w);
      counts.set(w, (counts.get(w) || 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([word, count]) => ({ word, count }));
}

/** Helpful rate per day (UTC), oldest first, for the last `days` days that have ratings. */
export function dailyTrend(rows, days = 30) {
  const byDay = new Map();
  for (const r of rows) {
    const date = new Date(r.createdAt);
    if (Number.isNaN(date.getTime())) continue;
    const key = date.toISOString().slice(0, 10);
    const day = byDay.get(key) || { date: key, helpful: 0, notHelpful: 0 };
    day[r.rating === 'HELPFUL' ? 'helpful' : 'notHelpful'] += 1;
    byDay.set(key, day);
  }
  return [...byDay.values()]
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-days)
    .map((d) => ({ ...d, total: d.helpful + d.notHelpful, rate: d.helpful / (d.helpful + d.notHelpful) }));
}

/** Turns raw feedback rows into the numbers shown on the Admin "AI quality" page. */
export function summariseFeedback(rows) {
  const out = {
    total: rows.length,
    helpful: 0,
    notHelpful: 0,
    helpfulRate: null,
    bySource: { LLM: emptyBucket(), AXE_FALLBACK: emptyBucket() },
    reasons: {},
    worstRules: [],
    recentComments: [],
    trend: [],
    complaintWords: [],
  };
  const perRule = {};

  for (const r of rows) {
    const good = r.rating === 'HELPFUL';
    out[good ? 'helpful' : 'notHelpful'] += 1;
    const source = r.explanation?.source === 'LLM' ? 'LLM' : 'AXE_FALLBACK';
    out.bySource[source][good ? 'helpful' : 'notHelpful'] += 1;
    if (!good && r.reason) out.reasons[r.reason] = (out.reasons[r.reason] || 0) + 1;

    const ruleId = r.explanation?.finding?.ruleId;
    if (ruleId) {
      perRule[ruleId] ??= { ruleId, helpful: 0, notHelpful: 0 };
      perRule[ruleId][good ? 'helpful' : 'notHelpful'] += 1;
    }
  }

  out.helpfulRate = out.total ? out.helpful / out.total : null;
  out.trend = dailyTrend(rows);
  out.complaintWords = topWords(rows.filter((r) => r.rating === 'NOT_HELPFUL' && r.comment).map((r) => r.comment));
  out.worstRules = Object.values(perRule)
    .filter((x) => x.notHelpful > 0)
    .sort((a, b) => b.notHelpful - a.notHelpful || a.ruleId.localeCompare(b.ruleId))
    .slice(0, 8);
  out.recentComments = rows
    .filter((r) => r.comment)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 10)
    .map((r) => ({
      rating: r.rating,
      reason: r.reason ?? null,
      comment: r.comment,
      ruleId: r.explanation?.finding?.ruleId ?? null,
      createdAt: r.createdAt,
    }));
  return out;
}

/**
 * Compares this scan with the previous scan of the same project, rule by rule.
 * Rules are compared by id and element count (not by exact selectors), so fixing one of three elements shows as "improved".
 */
export function compareScans(current, previous, previousScanId) {
  if (!previousScanId) return { comparison: null, changes: {} };
  const before = new Map(previous.map((f) => [f.ruleId, f.nodeCount]));
  const nowIds = new Set(current.map((f) => f.ruleId));
  const changes = {};
  const counts = { new: 0, worse: 0, improved: 0, same: 0 };

  for (const f of current) {
    const prev = before.get(f.ruleId);
    let change;
    if (prev === undefined) change = 'NEW';
    else if (f.nodeCount > prev) change = 'WORSE';
    else if (f.nodeCount < prev) change = 'IMPROVED';
    else change = 'SAME';
    changes[f.ruleId] = { change, previousNodeCount: prev ?? null };
    counts[change.toLowerCase()] += 1;
  }

  const resolved = [...before.keys()].filter((id) => !nowIds.has(id)).sort();
  return { comparison: { previousScanId, resolved, ...counts }, changes };
}

/**
 * Compares two scans of the same page rule by rule: what was fixed, what is new, and what is still there.
 * base = the earlier scan, current = the later one (the caller decides which is which).
 */
export function diffScans(base, current) {
  const before = new Map(base.map((f) => [f.ruleId, f]));
  const after = new Map(current.map((f) => [f.ruleId, f]));
  const row = (f, beforeCount, afterCount) => ({
    ruleId: f.ruleId,
    help: f.help ?? null,
    axeImpact: f.axeImpact ?? null,
    priority: f.prediction?.priority ?? null,
    before: beforeCount,
    after: afterCount,
  });
  const rank = { HIGH: 0, MEDIUM: 1, LOW: 2 };
  const byPriority = (a, b) => (rank[a.priority] ?? 3) - (rank[b.priority] ?? 3) || a.ruleId.localeCompare(b.ruleId);

  const fixed = base.filter((f) => !after.has(f.ruleId)).map((f) => row(f, f.nodeCount, 0)).sort(byPriority);
  const added = current.filter((f) => !before.has(f.ruleId)).map((f) => row(f, 0, f.nodeCount)).sort(byPriority);
  const unchanged = current
    .filter((f) => before.has(f.ruleId))
    .map((f) => row(f, before.get(f.ruleId).nodeCount, f.nodeCount))
    .sort(byPriority);
  return { fixed, new: added, unchanged };
}
