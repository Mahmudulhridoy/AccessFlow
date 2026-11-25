import env from '../config/env.js';

// Sends structured finding features (never HTML or selectors) to the FastAPI service and validates the reply.
// It NEVER throws: on any failure every finding gets a documented fallback priority from axe-core's impact,
// stored with source FALLBACK_AXE_IMPACT so it can never be mistaken for an ML prediction.

const BATCH_SIZE = 100;
const MAX_BODY_CHARS = 1_000_000;
const PRIORITY = { High: 'HIGH', Medium: 'MEDIUM', Low: 'LOW' };

// Documented fallback (same mapping as the "axe impact" baseline in ml-service). Not ground truth.
export const FALLBACK_BY_IMPACT = { CRITICAL: 'HIGH', SERIOUS: 'HIGH', MODERATE: 'MEDIUM', MINOR: 'LOW' };
export const fallbackPriority = (axeImpact) => FALLBACK_BY_IMPACT[axeImpact] ?? 'MEDIUM';

class MlCallError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

const configFromEnv = () => ({
  url: env.mlServiceUrl,
  apiKey: env.mlServiceApiKey,
  timeoutMs: env.mlTimeoutMs,
  acceptDevModel: env.mlAcceptDevModel,
});

export function toMlPayload(finding, pageFindingCount) {
  return {
    rule_id: finding.ruleId,
    axe_impact: finding.axeImpact ? finding.axeImpact.toLowerCase() : null,
    tags: (finding.tags || []).slice(0, 50).map((t) => String(t).slice(0, 100)),
    wcag_criteria: (finding.wcag || []).slice(0, 10).map((w) => ({ criterion: w.criterion, level: w.level ?? null })),
    node_count: finding.nodeCount,
    page_finding_count: pageFindingCount,
    nodes: (finding.nodes || []).slice(0, 50).map((n) => ({
      tag: n.tag ?? null,
      role: n.role ?? null,
      is_interactive: Boolean(n.isInteractive),
      landmark: n.landmark ?? null,
    })),
  };
}

function validatePrediction(p) {
  const ok =
    p && typeof p === 'object' &&
    Object.hasOwn(PRIORITY, p.priority) &&
    p.source === 'ML' &&
    typeof p.model_name === 'string' && p.model_name.length > 0 && p.model_name.length <= 80 &&
    typeof p.model_version === 'string' && p.model_version.length > 0 && p.model_version.length <= 40 &&
    typeof p.development_model === 'boolean' &&
    p.probabilities && typeof p.probabilities === 'object' &&
    Object.values(p.probabilities).every((v) => typeof v === 'number' && v >= 0 && v <= 1);
  if (!ok) throw new MlCallError('ML_BAD_RESPONSE');
  return p;
}

async function callBatch(payloads, cfg, fetchImpl) {
  let res;
  let text;
  try {
    res = await fetchImpl(`${cfg.url}/v1/predict/batch`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': cfg.apiKey },
      body: JSON.stringify({ findings: payloads }),
      signal: AbortSignal.timeout(cfg.timeoutMs),
      redirect: 'error', // never forward the API key to another host
    });
    if (res.status === 401 || res.status === 403) throw new MlCallError('ML_AUTH_FAILED');
    if (res.status === 503) throw new MlCallError('ML_MODEL_UNAVAILABLE');
    if (!res.ok) throw new MlCallError('ML_HTTP_ERROR');
    text = await res.text();
  } catch (err) {
    if (err instanceof MlCallError) throw err;
    if (err?.name === 'TimeoutError' || err?.name === 'AbortError') throw new MlCallError('ML_TIMEOUT');
    throw new MlCallError('ML_UNAVAILABLE');
  }

  if (typeof text !== 'string' || text.length > MAX_BODY_CHARS) throw new MlCallError('ML_BAD_RESPONSE');
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    throw new MlCallError('ML_BAD_RESPONSE');
  }
  if (!Array.isArray(body?.predictions) || body.predictions.length !== payloads.length) {
    throw new MlCallError('ML_BAD_RESPONSE');
  }
  return body.predictions.map(validatePrediction);
}

/**
 * @param findings normalised findings from axeNormalize (camelCase)
 * @returns one result per finding, same order: { priority, source, modelName, modelVersion, probabilities, features, failureReason }
 */
export async function classifyFindings(findings, options = {}) {
  if (!findings.length) return [];
  const cfg = { ...configFromEnv(), ...options.config };
  const fetchImpl = options.fetchImpl ?? fetch;
  const payloads = findings.map((f) => toMlPayload(f, findings.length));

  const fallback = (reason) =>
    findings.map((f, i) => ({
      priority: fallbackPriority(f.axeImpact),
      source: 'FALLBACK_AXE_IMPACT',
      modelName: null,
      modelVersion: null,
      probabilities: null,
      features: payloads[i],
      failureReason: reason,
    }));

  if (!cfg.url) return fallback('ML_NOT_CONFIGURED');

  try {
    const predictions = [];
    for (let i = 0; i < payloads.length; i += BATCH_SIZE) {
      predictions.push(...(await callBatch(payloads.slice(i, i + BATCH_SIZE), cfg, fetchImpl)));
    }
    if (!cfg.acceptDevModel && predictions.some((p) => p.development_model)) {
      return fallback('ML_DEV_MODEL_REJECTED');
    }
    return predictions.map((p, i) => ({
      priority: PRIORITY[p.priority],
      source: 'ML',
      modelName: p.model_name,
      modelVersion: (p.development_model ? `${p.model_version}+dev` : p.model_version).slice(0, 40),
      probabilities: p.probabilities,
      features: payloads[i],
      failureReason: null,
    }));
  } catch (err) {
    return fallback(err instanceof MlCallError ? err.code : 'ML_UNAVAILABLE');
  }
}
