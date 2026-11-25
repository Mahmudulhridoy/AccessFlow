import { explainFindings } from './llmExplanationService.js';

// The EXPLAINING stage of a scan. Never throws, so the scan can always complete.
export async function runExplanation(savedFindings, findings, deps = {}) {
  const explain = deps.explain ?? explainFindings;
  const store = deps.store ?? (await import('../models/explanation.model.js')).saveMany;
  const warnings = [];
  try {
    const results = await explain(findings);
    await store(savedFindings.map((f, i) => ({ findingId: f.id, ...results[i] })));
    const fallbacks = results.filter((r) => r.source !== 'LLM');
    if (fallbacks.length) {
      warnings.push({ code: 'LLM_FALLBACK_USED', reason: fallbacks[0].failureReason, count: fallbacks.length });
    }
  } catch (err) {
    console.error('explanation step failed:', err?.message);
    warnings.push({ code: 'EXPLANATION_FAILED' });
  }
  return warnings;
}
