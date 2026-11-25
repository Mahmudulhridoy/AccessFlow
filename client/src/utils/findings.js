export const PRIORITY_ORDER = ['HIGH', 'MEDIUM', 'LOW'];
export const PRIORITY_LABELS = { HIGH: 'High', MEDIUM: 'Medium', LOW: 'Low' };
export const IMPACT_LABELS = { CRITICAL: 'Critical', SERIOUS: 'Serious', MODERATE: 'Moderate', MINOR: 'Minor' };
const IMPACT_RANK = { CRITICAL: 0, SERIOUS: 1, MODERATE: 2, MINOR: 3 };

// Colour is never the only signal: every badge also carries a text label.
export const priorityBadge = (priority) =>
  ({
    HIGH: 'bg-[#fee4e2] text-[#912018]',
    MEDIUM: 'bg-amber-100 text-amber-900',
    LOW: 'bg-slate-100 text-slate-800',
  })[priority] || 'bg-slate-100 text-slate-700';

export const impactBadge = 'border border-line bg-white text-ink';

/** Where a priority came from, so a fallback is never shown as an ML prediction. */
export function priorityInfo(prediction) {
  if (!prediction) return { label: 'Not prioritised', source: 'NONE', dev: false, version: null };
  const dev = typeof prediction.modelVersion === 'string' && prediction.modelVersion.endsWith('+dev');
  return {
    label: PRIORITY_LABELS[prediction.priority] || 'Not prioritised',
    source: prediction.source === 'ML' ? 'ML' : 'FALLBACK',
    dev,
    version: prediction.modelVersion || null,
  };
}

export function sortFindings(findings) {
  const rank = (f) => {
    const i = PRIORITY_ORDER.indexOf(f.prediction?.priority);
    return i === -1 ? PRIORITY_ORDER.length : i;
  };
  return [...findings].sort(
    (a, b) =>
      rank(a) - rank(b) ||
      (IMPACT_RANK[a.axeImpact] ?? 9) - (IMPACT_RANK[b.axeImpact] ?? 9) ||
      a.ruleId.localeCompare(b.ruleId)
  );
}

/** Stable 1-based numbers for findings in their sorted order; the same numbers label the markers on the screenshot. */
export const numberFindings = (sorted) => new Map(sorted.map((f, i) => [f.id, i + 1]));

export const PRIORITY_COLORS = { HIGH: '#d92d20', MEDIUM: '#f79009', LOW: '#2e90fa', NONE: '#98a2b3' };
export const IMPACT_COLORS = { CRITICAL: '#b42318', SERIOUS: '#d92d20', MODERATE: '#f79009', MINOR: '#2e90fa' };
export const OUTCOME_COLORS = { Passed: '#12b76a', Violated: '#d92d20', 'Needs review': '#f79009', 'Not applicable': '#cbd0e1' };
const PRINCIPLES = { 1: 'Perceivable', 2: 'Operable', 3: 'Understandable', 4: 'Robust' };
export const PRINCIPLE_NAMES = Object.values(PRINCIPLES);

/** The WCAG principles a finding falls under, or ['Best practice'] when it maps to no success criterion. */
export function principlesOf(finding) {
  const names = new Set((finding.wcag || []).map((c) => PRINCIPLES[String(c.criterion)[0]]).filter(Boolean));
  return names.size ? [...names] : ['Best practice'];
}

/** How many issues fall under each WCAG principle (the first digit of the criterion, e.g. 1.4.3 -> Perceivable). */
export function principleCounts(findings) {
  const counts = { Perceivable: 0, Operable: 0, Understandable: 0, Robust: 0, 'Best practice': 0 };
  for (const f of findings) {
    const names = new Set((f.wcag || []).map((c) => PRINCIPLES[String(c.criterion)[0]]).filter(Boolean));
    if (names.size === 0) counts['Best practice'] += 1;
    names.forEach((n) => { counts[n] += 1; });
  }
  return Object.entries(counts).map(([name, count]) => ({ name, count }));
}

// ---- Score ---------------------------------------------------------------------------------------------------------
export const GRADE_COLORS = { A: '#12b76a', B: '#5fbf3f', C: '#f5b50a', D: '#f79009', F: '#d92d20' };

// ---- Priority confidence and the inputs behind a priority ------------------------------------------------------------
/** The model's probability for the priority it chose (0-1), plus all three, or null when the priority is not an ML prediction. */
export function confidenceOf(prediction) {
  if (!prediction || prediction.source !== 'ML' || !prediction.probabilities) return null;
  const probs = {};
  for (const key of PRIORITY_ORDER) {
    const raw = prediction.probabilities[PRIORITY_LABELS[key]] ?? prediction.probabilities[key];
    probs[key] = typeof raw === 'number' ? raw : 0;
  }
  const chosen = probs[prediction.priority];
  return { chosen: typeof chosen === 'number' ? chosen : 0, probs };
}

const LEVEL_RANK = { A: 0, AA: 1, AAA: 2 };

/**
 * The inputs the model was given for this finding, in plain words. This shows what the model looked at, NOT how much each
 * input mattered: the model does not report per-prediction feature weights, so none are claimed here.
 */
export function modelInputs(finding) {
  const nodes = finding.nodes || [];
  const levels = (finding.wcag || []).map((c) => c.level).filter(Boolean).sort((a, b) => (LEVEL_RANK[a] ?? 9) - (LEVEL_RANK[b] ?? 9));
  const interactive = nodes.filter((n) => n.isInteractive).length;
  const landmarks = nodes.map((n) => n.landmark).filter(Boolean);
  const topLandmark = landmarks.sort((a, b) => landmarks.filter((x) => x === b).length - landmarks.filter((x) => x === a).length)[0];
  const rows = [
    ['Scanner impact', IMPACT_LABELS[finding.axeImpact] || 'Unknown'],
    ['WCAG level', levels[0] ? `Level ${levels[0]}` : 'Best practice (no WCAG level)'],
    ['Affected elements', String(finding.nodeCount)],
  ];
  if (nodes.length) rows.push(['Interactive elements', `${interactive} of ${nodes.length} checked`]);
  if (topLandmark) rows.push(['Page region', topLandmark]);
  return rows;
}

/** First sentence of a block of text, shortened, for one-line summaries. */
export function firstSentence(text, max = 150) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  if (!clean) return '';
  const m = /^(.+?[.!?])(\s|$)/.exec(clean);
  const sentence = m ? m[1] : clean;
  return sentence.length > max ? `${sentence.slice(0, max - 1).trimEnd()}…` : sentence;
}

/** What to show as "the fix" for a finding: the AI suggestion when there is one, otherwise the scanner's own advice. */
export function fixOf(finding) {
  const ex = finding.explanation;
  const isAi = ex?.source === 'LLM' && Boolean(ex.suggestedFix);
  const scanner = [...new Set((finding.nodes || []).map((n) => n.failureSummary).filter(Boolean))][0];
  const text = isAi ? ex.suggestedFix : scanner || finding.help || finding.description;
  return { isAi, text, code: isAi ? ex.exampleCode || '' : '' };
}

const LLM_REASONS = {
  LLM_NOT_CONFIGURED: 'no Gemini API key is set on the server (GEMINI_API_KEY in server/.env)',
  LLM_AUTH_FAILED: 'the Gemini API key was rejected',
  LLM_RATE_LIMITED: 'the Gemini rate limit was reached',
  LLM_TIMEOUT: 'Gemini took too long to answer',
  LLM_UNAVAILABLE: 'Gemini could not be reached',
  LLM_HTTP_ERROR: 'Gemini returned an error',
  LLM_BAD_RESPONSE: 'Gemini returned an answer that failed our safety checks',
  LLM_BLOCKED: 'Gemini declined to answer',
  LLM_BUDGET_EXCEEDED: 'the time budget for explanations ran out',
};

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

export function describeWarnings(warnings) {
  if (!Array.isArray(warnings)) return [];
  const messages = [];
  for (const w of warnings) {
    switch (w?.code) {
      case 'ML_FALLBACK_USED':
        messages.push(`The priority model was unavailable, so priority for ${plural(w.count ?? 0, 'issue')} is estimated from the scanner's impact level instead.`);
        break;
      case 'LLM_FALLBACK_USED':
        messages.push(
          `AI explanations were unavailable for ${plural(w.count ?? 0, 'issue')}${LLM_REASONS[w.reason] ? ` because ${LLM_REASONS[w.reason]}` : ''}. ` +
            "The scanner's own guidance is shown instead.",
        );
        break;
      case 'UNKNOWN_RULES':
        messages.push('Some selected rules are not supported by this scanner version and were skipped.');
        break;
      case 'CLASSIFICATION_FAILED':
        messages.push('Issue priorities could not be saved, so issues are shown without priority.');
        break;
      case 'EXPLANATION_FAILED':
        messages.push('AI explanations could not be saved, so the scanner descriptions are shown.');
        break;
      default:
        break;
    }
  }
  return messages;
}
