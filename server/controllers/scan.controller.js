import * as Scan from '../models/scan.model.js';
import * as Project from '../models/project.model.js';
import * as Finding from '../models/finding.model.js';
import * as Feedback from '../models/feedback.model.js';
import { compareScans, diffScans } from '../services/aiFeedback.js';
import { scoreBlock, computeScore } from '../services/score.js';
import { AI_DISCLAIMER } from '../services/llmExplanationService.js';
import { enqueueScan } from '../services/scanWorker.js';

const DAILY_LIMIT = 20;
const DAY = 24 * 60 * 60 * 1000;

const parseId = (value) => {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
};

export async function get(req, res) {
  const id = parseId(req.params.id);
  const scan = id ? await Scan.findOwned(req.user.id, id) : null;
  if (!scan) return res.status(404).json({ error: 'Scan not found' });
  res.json({ scan });
}

export async function listForProject(req, res) {
  const id = parseId(req.params.id);
  const project = id ? await Project.findOwned(req.user.id, id) : null;
  if (!project) return res.status(404).json({ error: 'Project not found' });

  const rows = await Scan.listByProject(project.id);
  // findingCount lets the project page draw an "issues per scan" chart without loading every finding.
  const scans = rows.map(({ _count, ...scan }) => ({ ...scan, findingCount: _count?.findings ?? null }));
  res.json({ scans });
}

export async function start(req, res) {
  const id = parseId(req.params.id);
  const project = id ? await Project.findOwned(req.user.id, id) : null;
  if (!project) return res.status(404).json({ error: 'Project not found' });

  if (req.body?.permissionConfirmed !== true) {
    return res.status(400).json({ error: 'Confirm that you are allowed to test this website' });
  }

  if (await Project.hasActiveScan(project.id)) {
    return res.status(409).json({ error: 'A scan is already running for this project' });
  }

  const recent = await Scan.countSince(req.user.id, new Date(Date.now() - DAY));
  if (recent >= DAILY_LIMIT) {
    return res.status(429).json({ error: 'Daily scan limit reached. Try again tomorrow.' });
  }

  const scan = await Scan.create(project.id, project.url);
  enqueueScan(scan.id);
  res.status(202).json({ scan });
}

const count = (items, pick) =>
  items.reduce((acc, item) => {
    const key = pick(item) ?? 'NONE';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

// Internal diagnostics (exact features sent to the ML service, why a fallback was used) are not exposed to users.
const publicFinding = ({ prediction, explanation, ...f }) => ({
  ...f,
  explanation: explanation
    ? (({ feedback, ...rest }) => ({ ...rest, myFeedback: feedback?.[0] ?? null }))(explanation)
    : null,
  prediction: prediction
    ? {
        priority: prediction.priority,
        source: prediction.source,
        modelName: prediction.modelName,
        modelVersion: prediction.modelVersion,
        probabilities: prediction.probabilities,
      }
    : null,
});

export async function findings(req, res) {
  const id = parseId(req.params.id);
  const scan = id ? await Scan.findOwned(req.user.id, id) : null;
  if (!scan) return res.status(404).json({ error: 'Scan not found' });

  const items = await Finding.listForOwnedScan(req.user.id, scan.id);
  const prev = await Scan.previousCompleted(scan);
  const prevItems = prev ? await Finding.ruleCountsForScan(prev.id) : [];
  const { comparison, changes } = compareScans(items, prevItems, prev?.id ?? null);
  const toScoreItem = (f) => ({ nodeCount: f.nodeCount, priority: f.prediction?.priority });
  res.json({
    comparison,
    score: scoreBlock(items.map(toScoreItem), prevItems.map(toScoreItem), prev?.id ?? null),
    scan: { id: scan.id, status: scan.status, axeVersion: scan.axeVersion ?? null, rulesetId: scan.rulesetId ?? null },
    summary: {
      total: items.length,
      // "NONE" means no priority has been assigned (ML/fallback step has not run for that finding)
      byPriority: count(items, (f) => f.prediction?.priority),
      byScannerImpact: count(items, (f) => f.axeImpact),
      // ML = real model prediction; FALLBACK_AXE_IMPACT = derived from scanner impact; NONE = not prioritised
      prioritySources: count(items, (f) => f.prediction?.source),
    },
    findings: items.map((f) => ({ ...publicFinding(f), change: changes[f.ruleId] ?? null })),
    aiDisclaimer: AI_DISCLAIMER,
    disclaimer: 'Automated checks cover a selected rule set only and do not prove a page is accessible.',
  });
}

const DONE = ['COMPLETED', 'COMPLETED_WITH_WARNINGS'];

// Two finished scans of the same project side by side: :id is the later scan, :otherId the earlier one it is compared with.
export async function compare(req, res) {
  const currentId = parseId(req.params.id);
  const baseId = parseId(req.params.otherId);
  if (!currentId || !baseId) return res.status(404).json({ error: 'Scan not found' });
  if (currentId === baseId) return res.status(400).json({ error: 'Pick two different scans to compare' });

  const [current, base] = await Promise.all([Scan.findOwned(req.user.id, currentId), Scan.findOwned(req.user.id, baseId)]);
  if (!current || !base) return res.status(404).json({ error: 'Scan not found' });
  if (current.projectId !== base.projectId) return res.status(400).json({ error: 'Only scans of the same project can be compared' });
  if (!DONE.includes(current.status) || !DONE.includes(base.status)) {
    return res.status(400).json({ error: 'Both scans must be finished before they can be compared' });
  }

  const [currentItems, baseItems] = await Promise.all([
    Finding.listSummaryForOwnedScan(req.user.id, current.id),
    Finding.listSummaryForOwnedScan(req.user.id, base.id),
  ]);
  const meta = (scan, items) => ({
    id: scan.id,
    createdAt: scan.createdAt,
    scannedUrl: scan.scannedUrl,
    total: items.length,
    score: computeScore(items.map((f) => ({ nodeCount: f.nodeCount, priority: f.prediction?.priority }))),
  });
  res.json({ base: meta(base, baseItems), current: meta(current, currentItems), ...diffScans(baseItems, currentItems) });
}

// A user rates one AI explanation (helpful / not helpful, with an optional reason and comment).
export async function feedback(req, res) {
  const findingId = parseId(req.params.id);
  const explanation = findingId ? await Feedback.findOwnedExplanation(req.user.id, findingId) : null;
  if (!explanation) return res.status(404).json({ error: 'Explanation not found' });

  const saved = await Feedback.upsert(explanation.id, req.user.id, req.body);
  res.json({ feedback: saved });
}
