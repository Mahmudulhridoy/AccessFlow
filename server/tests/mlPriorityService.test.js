import { describe, it, expect, vi } from 'vitest';
import { classifyFindings, fallbackPriority, toMlPayload } from '../services/mlPriorityService.js';
import { runClassification } from '../services/classificationStep.js';

const finding = (over = {}) => ({
  ruleId: 'button-name', axeImpact: 'CRITICAL', tags: ['cat.name-role-value', 'wcag2a', 'wcag412'],
  wcag: [{ criterion: '4.1.2', level: 'A' }], nodeCount: 2,
  nodes: [{ selector: '#secret-selector', htmlSnippet: '<button>private text</button>', tag: 'button', role: null, isInteractive: true, landmark: 'main' }],
  ...over,
});
const cfg = { url: 'http://ml.test', apiKey: 'k3y', timeoutMs: 200, acceptDevModel: false };
const pred = (over = {}) => ({
  priority: 'High', probabilities: { Low: 0.1, Medium: 0.2, High: 0.7 }, source: 'ML', model_name: 'accessflow_priority',
  model_version: '2026.11.20-v1', feature_version: '1.0', model_origin: 'real_annotated', development_model: false, ...over,
});
const reply = (status, body) => async () => ({ status, ok: status >= 200 && status < 300, text: async () => (typeof body === 'string' ? body : JSON.stringify(body)) });
const run = (findings, fetchImpl, config = {}) => classifyFindings(findings, { config: { ...cfg, ...config }, fetchImpl });

describe('ML priority service client', () => {
  it('returns validated ML predictions with model version', async () => {
    const out = await run([finding(), finding({ ruleId: 'region' })], reply(200, { predictions: [pred(), pred({ priority: 'Low' })] }));
    expect(out.map((o) => o.priority)).toEqual(['HIGH', 'LOW']);
    expect(out[0]).toMatchObject({ source: 'ML', modelName: 'accessflow_priority', modelVersion: '2026.11.20-v1', failureReason: null });
  });

  it('sends only structured features, with the API key, and no HTML or selectors', async () => {
    const fetchImpl = vi.fn(reply(200, { predictions: [pred()] }));
    await run([finding()], fetchImpl);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('http://ml.test/v1/predict/batch');
    expect(init.headers['x-api-key']).toBe('k3y');
    expect(init.redirect).toBe('error');
    expect(init.body).not.toContain('secret-selector');
    expect(init.body).not.toContain('private text');
    const sent = JSON.parse(init.body).findings[0];
    expect(sent).toMatchObject({ rule_id: 'button-name', axe_impact: 'critical', node_count: 2, page_finding_count: 1 });
    expect(sent.nodes[0]).toEqual({ tag: 'button', role: null, is_interactive: true, landmark: 'main' });
  });

  it('falls back (marked as fallback, not ML) when the service is unreachable', async () => {
    const out = await run([finding(), finding({ axeImpact: 'MINOR' })], async () => { throw new TypeError('fetch failed'); });
    expect(out.map((o) => o.priority)).toEqual(['HIGH', 'LOW']);
    for (const o of out) expect(o).toMatchObject({ source: 'FALLBACK_AXE_IMPACT', modelVersion: null, modelName: null, failureReason: 'ML_UNAVAILABLE' });
  });

  it('times out instead of hanging', async () => {
    const hang = (url, init) => new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(init.signal.reason)));
    const out = await run([finding()], hang, { timeoutMs: 30 });
    expect(out[0]).toMatchObject({ source: 'FALLBACK_AXE_IMPACT', failureReason: 'ML_TIMEOUT' });
  });

  it('maps HTTP failures to clear fallback reasons', async () => {
    expect((await run([finding()], reply(503, { detail: { code: 'MODEL_UNAVAILABLE' } })))[0].failureReason).toBe('ML_MODEL_UNAVAILABLE');
    expect((await run([finding()], reply(401, {})))[0].failureReason).toBe('ML_AUTH_FAILED');
    expect((await run([finding()], reply(500, {})))[0].failureReason).toBe('ML_HTTP_ERROR');
  });

  it('rejects malformed or untrustworthy responses', async () => {
    const bad = [
      'not json',
      { predictions: [] },
      { predictions: [pred({ priority: 'Critical' })] },
      { predictions: [pred({ source: 'FALLBACK' })] },
      { predictions: [pred({ probabilities: { High: 7 } })] },
      { predictions: [pred({ model_version: '' })] },
      { nope: true },
    ];
    for (const body of bad) {
      const out = await run([finding()], reply(200, body));
      expect(out[0]).toMatchObject({ source: 'FALLBACK_AXE_IMPACT', failureReason: 'ML_BAD_RESPONSE' });
    }
  });

  it('does not call the service when it is not configured', async () => {
    const fetchImpl = vi.fn();
    const out = await run([finding()], fetchImpl, { url: '' });
    expect(fetchImpl).toHaveBeenCalledTimes(0);
    expect(out[0]).toMatchObject({ source: 'FALLBACK_AXE_IMPACT', failureReason: 'ML_NOT_CONFIGURED' });
  });

  it('rejects development-model predictions unless explicitly accepted', async () => {
    const body = { predictions: [pred({ development_model: true, model_version: '2026.11.16-synthetic_fixture' })] };
    expect((await run([finding()], reply(200, body)))[0]).toMatchObject({ source: 'FALLBACK_AXE_IMPACT', failureReason: 'ML_DEV_MODEL_REJECTED' });
    const accepted = (await run([finding()], reply(200, body), { acceptDevModel: true }))[0];
    expect(accepted.source).toBe('ML');
    expect(accepted.modelVersion).toBe('2026.11.16-synthetic_fixture+dev');
  });

  it('splits large inputs into batches of 100', async () => {
    const many = Array.from({ length: 230 }, () => finding());
    const fetchImpl = vi.fn(async (url, init) => {
      const n = JSON.parse(init.body).findings.length;
      return { status: 200, ok: true, text: async () => JSON.stringify({ predictions: Array.from({ length: n }, () => pred()) }) };
    });
    const out = await run(many, fetchImpl);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(out).toHaveLength(230);
  });

  it('returns nothing and makes no call for a clean scan', async () => {
    const fetchImpl = vi.fn();
    expect(await run([], fetchImpl)).toEqual([]);
    expect(fetchImpl).toHaveBeenCalledTimes(0);
  });

  it('uses the documented impact fallback mapping', () => {
    expect(['CRITICAL', 'SERIOUS', 'MODERATE', 'MINOR', null].map(fallbackPriority)).toEqual(['HIGH', 'HIGH', 'MEDIUM', 'LOW', 'MEDIUM']);
    expect(toMlPayload(finding({ axeImpact: null }), 3).axe_impact).toBeNull();
  });
});

describe('classification step (scan completes even if ML fails)', () => {
  const saved = [{ id: 11 }, { id: 12 }];
  const findings = [finding(), finding({ ruleId: 'region', axeImpact: 'MODERATE' })];

  it('stores fallback priorities and warns when the ML service is down', async () => {
    const store = vi.fn(async () => ({}));
    const classify = (f) => classifyFindings(f, { config: cfg, fetchImpl: async () => { throw new Error('ECONNREFUSED'); } });
    const warnings = await runClassification(saved, findings, { classify, store });
    expect(warnings).toEqual([{ code: 'ML_FALLBACK_USED', reason: 'ML_UNAVAILABLE', count: 2 }]);
    const rows = store.mock.calls[0][0];
    expect(rows.map((r) => [r.findingId, r.priority, r.source])).toEqual([[11, 'HIGH', 'FALLBACK_AXE_IMPACT'], [12, 'MEDIUM', 'FALLBACK_AXE_IMPACT']]);
  });

  it('produces no warnings when every finding has a real ML prediction', async () => {
    const store = vi.fn(async () => ({}));
    const classify = (f) => classifyFindings(f, { config: cfg, fetchImpl: reply(200, { predictions: [pred(), pred()] }) });
    expect(await runClassification(saved, findings, { classify, store })).toEqual([]);
  });

  it('never throws, even if classification or storing blows up', async () => {
    const boom = async () => { throw new Error('db down'); };
    expect(await runClassification(saved, findings, { classify: boom, store: async () => ({}) })).toEqual([{ code: 'CLASSIFICATION_FAILED' }]);
    const ok = async (f) => f.map(() => ({ priority: 'LOW', source: 'ML' }));
    expect(await runClassification(saved, findings, { classify: ok, store: boom })).toEqual([{ code: 'CLASSIFICATION_FAILED' }]);
  });
});
