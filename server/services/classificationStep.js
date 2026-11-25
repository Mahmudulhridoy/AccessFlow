import { classifyFindings } from './mlPriorityService.js';

// The CLASSIFYING stage of a scan. It never throws: whatever happens here, the scan can still complete.
// Returns scan warnings (empty when every finding got a real ML prediction).
export async function runClassification(savedFindings, findings, deps = {}) {
  const classify = deps.classify ?? classifyFindings;
  const store = deps.store ?? (await import('../models/prediction.model.js')).saveMany;
  const warnings = [];
  try {
    const results = await classify(findings);
    await store(savedFindings.map((f, i) => ({ findingId: f.id, ...results[i] })));
    const fallbacks = results.filter((r) => r.source !== 'ML');
    if (fallbacks.length) {
      warnings.push({ code: 'ML_FALLBACK_USED', reason: fallbacks[0].failureReason, count: fallbacks.length });
    }
  } catch (err) {
    console.error('classification step failed:', err?.message);
    warnings.push({ code: 'CLASSIFICATION_FAILED' });
  }
  return warnings;
}
