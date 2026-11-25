import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { metadataToRecord, presentEvaluation, MetadataError } from '../services/mlEvaluation.js';

vi.mock('../services/scanWorker.js', () => ({ enqueueScan: vi.fn() }));
vi.mock('../services/mailer.js', () => ({ sendResetEmail: vi.fn() }));
vi.mock('../config/db.js', () => {
  const db = { evaluations: [] };
  const prisma = { mlModelEvaluation: { findMany: async () => db.evaluations } };
  Object.defineProperty(prisma, 'db', { get: () => db });
  return { default: prisma };
});

import app from '../app.js';
import prisma from '../config/db.js';

const token = (id, role) => ({ Authorization: `Bearer ${jwt.sign({ sub: id, role }, 'test-secret', { expiresIn: '5m' })}` });

const metrics = (f1) => ({ precision_macro: f1, recall_macro: f1, f1_macro: f1, high_recall: f1 });
const metadata = (over = {}) => ({
  model_name: 'accessflow_priority', model_version: '2026.12.01-v1', algorithm: 'random_forest', random_forest_selected: true,
  training_date_utc: '2026-12-01T10:00:00+00:00', is_synthetic: false, production_eligible: true, eligibility_reason: 'all readiness gates passed',
  evaluation_status: 'meaningful', feature_version: '1.0', labels: ['Low', 'Medium', 'High'],
  dataset: { version: 'v1', origin: 'own_collected', n_total: 700, n_train: 560, n_test: 140, n_domains_train: 60, n_domains_test: 15,
    class_counts_train: { Low: 200, Medium: 250, High: 110 }, class_counts_test: { Low: 50, Medium: 60, High: 30 }, quality_report: { readiness_gates: { enough_domains: true }, self_consistency: { weighted_kappa: 0.7 } } },
  test_metrics_selected: { ...metrics(0.8), per_class: { Low: { precision: 0.8, recall: 0.8, 'f1-score': 0.8, support: 50 } }, confusion_matrix: [[40, 8, 2], [5, 50, 5], [1, 4, 25]] },
  test_metrics_all_models: { random_forest: metrics(0.8), majority_class: metrics(0.2), axe_impact_mapping: metrics(0.6) },
  selection: { selected: 'random_forest', cv: { random_forest: { cv_macro_f1_mean: 0.78 } } }, test_ci_selected: { macro_f1_95ci: [0.7, 0.88] },
  beats_axe_impact_baseline_on_test_macro_f1: true, training_config: { seed: 42 }, environment: { python: '3.13' }, ...over,
});
const synthetic = () => metadata({ is_synthetic: true, production_eligible: false, evaluation_status: 'NOT_VALID_PERFORMANCE_DEVELOPMENT_ONLY', dataset: { ...metadata().dataset, origin: 'synthetic_fixture', version: 'synthetic' } });
const asRow = (meta, id = 1) => ({ id, createdAt: new Date(), ...metadataToRecord(meta) });

describe('ML evaluation import mapping', () => {
  it('copies metrics from the exported metadata without inventing values', () => {
    const r = metadataToRecord(metadata());
    expect(r).toMatchObject({ modelName: 'accessflow_priority', modelVersion: '2026.12.01-v1', datasetVersion: 'v1', datasetOrigin: 'REAL_ANNOTATED', datasetSize: 700, f1Macro: 0.8 });
    expect(r.confusionMatrix).toEqual([[40, 8, 2], [5, 50, 5], [1, 4, 25]]);
    expect(Object.keys(r.baselines.testMetrics)).toEqual(['random_forest', 'majority_class', 'axe_impact_mapping']);
    expect(r.trainingConfig.productionEligible).toBe(true);
  });

  it('maps synthetic fixture data to the SYNTHETIC_FIXTURE origin', () => {
    expect(metadataToRecord(synthetic()).datasetOrigin).toBe('SYNTHETIC_FIXTURE');
  });

  it('rejects incomplete, malformed or unknown-origin metadata', () => {
    const { model_version, ...missing } = metadata();
    for (const bad of [null, 'x', missing, metadata({ dataset: { ...metadata().dataset, origin: 'scraped' } }),
      metadata({ test_metrics_selected: { ...metadata().test_metrics_selected, f1_macro: 'high' } }), metadata({ training_date_utc: 'yesterday' })]) {
      expect(() => metadataToRecord(bad)).toThrow(MetadataError);
    }
  });
});

describe('Admin presenter', () => {
  it('shows metrics, matrix and baselines for a validated real-data model', () => {
    const p = presentEvaluation(asRow(metadata()));
    expect(p.status).toBe('VALIDATED');
    expect(p.metricsWithheld).toBe(false);
    expect(p.metrics).toMatchObject({ precisionMacro: 0.8, highRecall: 0.8 });
    expect(p.comparison.beatsAxeImpactBaseline).toBe(true);
    expect(p.confusionMatrix).toHaveLength(3);
  });

  it('withholds every metric for synthetic models, on the server', () => {
    const p = presentEvaluation(asRow(synthetic()));
    expect(p.status).toBe('SYNTHETIC_DEVELOPMENT_ONLY');
    expect(p.metricsWithheld).toBe(true);
    for (const key of ['metrics', 'perClass', 'confusionMatrix', 'comparison']) expect(p[key]).toBeUndefined();
    expect(JSON.stringify(p)).not.toContain('"f1Macro"');
  });

  it('labels real-data models that failed the quality gates as exploratory', () => {
    const p = presentEvaluation(asRow(metadata({ production_eligible: false, eligibility_reason: "readiness gates failed: ['enough_domains']" })));
    expect(p.status).toBe('EXPLORATORY');
    expect(p.eligibilityReason).toContain('enough_domains');
  });
});

describe('GET /api/admin/ml/evaluations', () => {
  beforeEach(() => { prisma.db.evaluations.length = 0; });

  it('requires authentication', async () => {
    expect((await request(app).get('/api/admin/ml/evaluations')).status).toBe(401);
  });

  it('is forbidden for normal users', async () => {
    const r = await request(app).get('/api/admin/ml/evaluations').set(token(1, 'USER'));
    expect(r.status).toBe(403);
  });

  it('returns an empty list for an admin when nothing was imported (no sample data)', async () => {
    const r = await request(app).get('/api/admin/ml/evaluations').set(token(9, 'ADMIN'));
    expect(r.status).toBe(200);
    expect(r.body.evaluations).toEqual([]);
  });

  it('returns saved records for an admin, with synthetic metrics withheld', async () => {
    prisma.db.evaluations.push(asRow(metadata(), 1), asRow(synthetic(), 2));
    const r = await request(app).get('/api/admin/ml/evaluations').set(token(9, 'ADMIN'));
    expect(r.status).toBe(200);
    expect(r.body.evaluations.map((e) => e.status)).toEqual(['VALIDATED', 'SYNTHETIC_DEVELOPMENT_ONLY']);
    expect(r.body.evaluations[1].metrics).toBeUndefined();
  });

  it('is read-only: write methods are not routed', async () => {
    for (const method of ['post', 'put', 'delete']) {
      const r = await request(app)[method]('/api/admin/ml/evaluations').set(token(9, 'ADMIN'));
      expect([404, 405]).toContain(r.status);
    }
  });
});
