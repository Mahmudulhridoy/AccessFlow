import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';

vi.mock('../services/scanWorker.js', () => ({ enqueueScan: vi.fn() }));
vi.mock('../services/mailer.js', () => ({ sendResetEmail: vi.fn() }));
vi.mock('../config/db.js', () => {
  const db = { project: [], scan: [], finding: [], explanation: [], feedback: [] };
  const prisma = {
    scan: {
      // mirrors Scan.findOwned: where { id, project: { userId } }
      findFirst: async ({ where }) => {
        // Scan.previousCompleted: where { projectId, id: { lt }, status: { in } }, newest first
        if (!where.project) {
          return db.scan
            .filter((x) => x.projectId === where.projectId && x.id < where.id.lt && where.status.in.includes(x.status))
            .sort((a, b) => b.id - a.id)[0] || null;
        }
        const s = db.scan.find((x) => x.id === where.id);
        const p = s && db.project.find((q) => q.id === s.projectId);
        return s && p && p.userId === where.project.userId ? s : null;
      },
    },
    aiExplanation: {
      // mirrors Feedback.findOwnedExplanation: where { findingId, finding: { scan: { project: { userId } } } }
      findFirst: async ({ where }) => {
        const e = db.explanation.find((x) => x.findingId === where.findingId);
        const f = e && db.finding.find((x) => x.id === e.findingId);
        const sc = f && db.scan.find((x) => x.id === f.scanId);
        const p = sc && db.project.find((q) => q.id === sc.projectId);
        return p && p.userId === where.finding.scan.project.userId ? { id: e.id, source: e.source } : null;
      },
    },
    explanationFeedback: {
      upsert: async ({ where, create, update }) => {
        const key = where.explanationId_userId;
        const row = db.feedback.find((x) => x.explanationId === key.explanationId && x.userId === key.userId);
        if (row) { Object.assign(row, update); return { rating: row.rating, reason: row.reason, comment: row.comment }; }
        db.feedback.push({ ...create });
        return { rating: create.rating, reason: create.reason, comment: create.comment };
      },
    },
    finding: {
      // mirrors Finding.listForOwnedScan and Finding.ruleCountsForScan: where { scanId, scan: { project: { userId } } }
      findMany: async ({ where }) =>
        db.finding.filter((f) => {
          if (f.scanId !== where.scanId) return false;
          if (!where.scan) return true; // ruleCountsForScan has no ownership filter (the scan id comes from an owned scan)
          const s = db.scan.find((x) => x.id === f.scanId);
          const p = db.project.find((q) => q.id === s.projectId);
          return p.userId === where.scan.project.userId;
        }),
    },
  };
  Object.defineProperty(prisma, 'db', { get: () => db });
  return { default: prisma };
});

import app from '../app.js';
import prisma from '../config/db.js';

const token = (id, role = 'USER') => jwt.sign({ sub: id, role }, 'test-secret', { expiresIn: '5m' });
const auth = (id) => ({ Authorization: `Bearer ${token(id)}` });

const finding = (over) => ({
  id: 1, scanId: 10, ruleId: 'image-alt', axeImpact: 'CRITICAL', nodeCount: 2,
  nodes: [], wcag: [{ criterion: '1.1.1', level: 'A' }], prediction: null, explanation: null, ...over,
});

beforeEach(() => {
  const db = prisma.db;
  db.project.length = db.scan.length = db.finding.length = db.explanation.length = db.feedback.length = 0;
  db.project.push({ id: 1, userId: 1 }, { id: 2, userId: 2 });
  db.scan.push(
    { id: 10, projectId: 1, status: 'COMPLETED', axeVersion: '4.10.0', rulesetId: 'accessflow-core-v1' },
    { id: 11, projectId: 1, status: 'COMPLETED' },
  );
});

describe('GET /api/scans/:id/findings', () => {
  it('requires authentication', async () => {
    expect((await request(app).get('/api/scans/10/findings')).status).toBe(401);
  });

  it("does not expose another user's findings", async () => {
    prisma.db.finding.push(finding());
    const r = await request(app).get('/api/scans/10/findings').set(auth(2));
    expect(r.status).toBe(404);
    expect(JSON.stringify(r.body)).not.toContain('image-alt');
  });

  it('returns 404 for invalid or unknown scan ids', async () => {
    for (const id of ['abc', '0', '-3', '999']) {
      expect((await request(app).get(`/api/scans/${id}/findings`).set(auth(1))).status).toBe(404);
    }
  });

  it('returns an empty list with zero totals for a clean scan', async () => {
    const r = await request(app).get('/api/scans/11/findings').set(auth(1));
    expect(r.status).toBe(200);
    expect(r.body.findings).toEqual([]);
    expect(r.body.summary.total).toBe(0);
  });

  it('returns multiple findings for the owner with scanner impact and honest priority counts', async () => {
    prisma.db.finding.push(
      finding({ id: 1 }),
      finding({ id: 2, ruleId: 'button-name', axeImpact: 'SERIOUS', prediction: { priority: 'HIGH', source: 'ML' } }),
      finding({ id: 3, ruleId: 'region', axeImpact: 'MODERATE' }),
    );
    const r = await request(app).get('/api/scans/10/findings').set(auth(1));
    expect(r.status).toBe(200);
    expect(r.body.summary.total).toBe(3);
    expect(r.body.summary.byScannerImpact).toEqual({ CRITICAL: 1, SERIOUS: 1, MODERATE: 1 });
    expect(r.body.summary.byPriority).toEqual({ HIGH: 1, NONE: 2 });
    expect(r.body.summary.prioritySources).toEqual({ ML: 1, NONE: 2 });
    expect(r.body.scan.rulesetId).toBe('accessflow-core-v1');
    expect(r.body.disclaimer).toMatch(/do not prove/);
  });

  it('does not expose internal ML diagnostics to users', async () => {
    prisma.db.finding.push(finding({ prediction: { priority: 'HIGH', source: 'FALLBACK_AXE_IMPACT', modelName: null, modelVersion: null, probabilities: null, features: { rule_id: 'x' }, failureReason: 'ML_AUTH_FAILED' } }));
    const r = await request(app).get('/api/scans/10/findings').set(auth(1));
    expect(r.body.findings[0].prediction).toEqual({ priority: 'HIGH', source: 'FALLBACK_AXE_IMPACT', modelName: null, modelVersion: null, probabilities: null });
    expect(JSON.stringify(r.body)).not.toContain('ML_AUTH_FAILED');
  });

  it("does not leak findings from a different scan of the same owner", async () => {
    prisma.db.finding.push(finding({ id: 9, scanId: 10 }));
    const r = await request(app).get('/api/scans/11/findings').set(auth(1));
    expect(r.body.findings).toEqual([]);
  });
});

describe('scan comparison and AI feedback', () => {
  it('marks findings as new / improved compared with the previous scan', async () => {
    prisma.db.finding.push(
      finding({ id: 1, scanId: 10, ruleId: 'image-alt', nodeCount: 3 }),
      finding({ id: 2, scanId: 10, ruleId: 'label', nodeCount: 1 }),
      finding({ id: 3, scanId: 11, ruleId: 'image-alt', nodeCount: 2 }),
      finding({ id: 4, scanId: 11, ruleId: 'link-name', nodeCount: 1 }),
    );
    const r = await request(app).get('/api/scans/11/findings').set(auth(1));
    expect(r.status).toBe(200);
    expect(r.body.comparison).toMatchObject({ previousScanId: 10, resolved: ['label'], new: 1, improved: 1 });
    const by = Object.fromEntries(r.body.findings.map((f) => [f.ruleId, f.change.change]));
    expect(by).toEqual({ 'image-alt': 'IMPROVED', 'link-name': 'NEW' });
  });

  it('has no comparison for the first scan of a project', async () => {
    prisma.db.finding.push(finding());
    const r = await request(app).get('/api/scans/10/findings').set(auth(1));
    expect(r.body.comparison).toBeNull();
  });

  it('saves feedback only for the owner, validates input, and drops the reason for a positive rating', async () => {
    prisma.db.finding.push(finding({ id: 1, scanId: 10 }));
    prisma.db.explanation.push({ id: 5, findingId: 1, source: 'LLM' });

    expect((await request(app).post('/api/findings/1/feedback').send({ rating: 'HELPFUL' })).status).toBe(401);
    expect((await request(app).post('/api/findings/1/feedback').set(auth(2)).send({ rating: 'HELPFUL' })).status).toBe(404);
    expect((await request(app).post('/api/findings/1/feedback').set(auth(1)).send({ rating: 'GREAT' })).status).toBe(400);

    const ok = await request(app).post('/api/findings/1/feedback').set(auth(1)).send({ rating: 'HELPFUL', reason: 'WRONG_FIX', comment: ' worked ' });
    expect(ok.status).toBe(200);
    expect(ok.body.feedback).toEqual({ rating: 'HELPFUL', reason: null, comment: 'worked' });
    expect(prisma.db.feedback).toHaveLength(1);
  });
});

describe('score in the findings response', () => {
  it('returns a score and the change since the previous scan', async () => {
    prisma.db.finding.push(
      finding({ id: 1, scanId: 10, ruleId: 'image-alt', nodeCount: 3, prediction: { priority: 'HIGH', source: 'ML' } }),
      finding({ id: 2, scanId: 11, ruleId: 'label', nodeCount: 1, prediction: { priority: 'LOW', source: 'ML' } }),
    );
    const r = await request(app).get('/api/scans/11/findings').set(auth(1));
    expect(r.body.score.previous.scanId).toBe(10);
    expect(r.body.score.delta).toBeGreaterThan(0);
    expect(r.body.score.grade).toMatch(/^[A-F]$/);
  });

  it('gives a clean first scan 100 / A and no previous score', async () => {
    const r = await request(app).get('/api/scans/10/findings').set(auth(1));
    expect(r.body.score).toEqual({ value: 100, grade: 'A', previous: null, delta: null });
  });
});

describe('GET /api/scans/:id/compare/:otherId', () => {
  beforeEach(() => {
    prisma.db.project.push({ id: 3, userId: 1 });
    prisma.db.scan.push({ id: 12, projectId: 1, status: 'FAILED' }, { id: 14, projectId: 3, status: 'COMPLETED' });
    prisma.db.finding.push(
      finding({ id: 1, scanId: 10, ruleId: 'image-alt', nodeCount: 3, prediction: { priority: 'HIGH' } }),
      finding({ id: 2, scanId: 10, ruleId: 'label', nodeCount: 1 }),
      finding({ id: 3, scanId: 11, ruleId: 'image-alt', nodeCount: 1, prediction: { priority: 'HIGH' } }),
      finding({ id: 4, scanId: 11, ruleId: 'link-name', nodeCount: 2 }),
    );
  });

  it('requires authentication and ownership of BOTH scans', async () => {
    expect((await request(app).get('/api/scans/11/compare/10')).status).toBe(401);
    expect((await request(app).get('/api/scans/11/compare/10').set(auth(2))).status).toBe(404);
  });

  it('shows what was fixed, what is new and what remains, with a score for each scan', async () => {
    const r = await request(app).get('/api/scans/11/compare/10').set(auth(1));
    expect(r.status).toBe(200);
    expect(r.body.fixed.map((x) => x.ruleId)).toEqual(['label']);
    expect(r.body.new.map((x) => x.ruleId)).toEqual(['link-name']);
    expect(r.body.unchanged[0]).toMatchObject({ ruleId: 'image-alt', before: 3, after: 1 });
    expect(r.body.base.id).toBe(10);
    expect(r.body.current.score.grade).toMatch(/^[A-F]$/);
  });

  it('rejects the same scan twice, scans of different projects, unfinished scans and bad ids', async () => {
    expect((await request(app).get('/api/scans/11/compare/11').set(auth(1))).status).toBe(400);
    expect((await request(app).get('/api/scans/14/compare/10').set(auth(1))).status).toBe(400);
    expect((await request(app).get('/api/scans/12/compare/10').set(auth(1))).status).toBe(400);
    expect((await request(app).get('/api/scans/abc/compare/10').set(auth(1))).status).toBe(404);
    expect((await request(app).get('/api/scans/11/compare/999').set(auth(1))).status).toBe(404);
  });
});
