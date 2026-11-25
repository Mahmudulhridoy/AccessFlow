import { createRequire } from 'module';
import fs from 'fs';
import { RULESET_ID, SELECTED_RULES } from '../config/axeRules.js';
import { normalizeViolations } from './axeNormalize.js';

const require = createRequire(import.meta.url);
let axeSource = null;
const loadAxe = () => {
  axeSource ??= fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
  return axeSource;
};

// Runs inside the page: executes the selected rules and extracts structural context per node.
// Context features are computed here because DOM elements cannot be sent back to Node.
async function runInPage(ruleIds) {
  const known = new Set(window.axe.getRules().map((r) => r.ruleId));
  const values = ruleIds.filter((id) => known.has(id));
  const unknown = ruleIds.filter((id) => !known.has(id));

  const results = await window.axe.run(document, {
    runOnly: { type: 'rule', values },
    resultTypes: ['violations'],
    elementRef: true,
  });

  const LANDMARKS = {
    header: 'banner', nav: 'navigation', main: 'main', footer: 'contentinfo',
    aside: 'complementary', form: 'form', dialog: 'dialog',
  };
  const ROLE_LANDMARKS = ['banner', 'navigation', 'main', 'contentinfo', 'complementary', 'form', 'search', 'dialog'];
  const INTERACTIVE_TAGS = ['a', 'button', 'input', 'select', 'textarea', 'summary'];
  const INTERACTIVE_ROLES = ['button', 'link', 'checkbox', 'radio', 'tab', 'menuitem', 'switch', 'textbox', 'combobox', 'slider'];

  const featuresOf = (el) => {
    if (!el || !el.tagName) return {};
    const tag = el.tagName.toLowerCase();
    const role = el.getAttribute('role');
    let landmark = null;
    for (let p = el; p && p.tagName; p = p.parentElement) {
      const r = p.getAttribute('role');
      if (r && ROLE_LANDMARKS.includes(r)) { landmark = r; break; }
      const implicit = LANDMARKS[p.tagName.toLowerCase()];
      if (implicit) { landmark = implicit; break; }
    }
    const tabindex = el.getAttribute('tabindex');
    const isInteractive =
      (INTERACTIVE_TAGS.includes(tag) && !(tag === 'a' && !el.hasAttribute('href'))) ||
      (role && INTERACTIVE_ROLES.includes(role)) ||
      (tabindex !== null && Number(tabindex) >= 0) ||
      el.hasAttribute('onclick');
    return { tag, role, landmark, isInteractive: Boolean(isInteractive) };
  };

  // Position on the full-page screenshot (viewport rect + scroll offset). Elements inside an iframe report a rect relative
  // to that iframe, so they are skipped (axe marks them with a target of more than one part). Hidden elements have no size.
  const bboxOf = (n) => {
    const el = n.element;
    if (!el || typeof el.getBoundingClientRect !== 'function' || !Array.isArray(n.target) || n.target.length !== 1) return null;
    const r = el.getBoundingClientRect();
    if (!(r.width >= 1) || !(r.height >= 1)) return null;
    return {
      x: Math.round(r.left + window.scrollX),
      y: Math.round(r.top + window.scrollY),
      w: Math.round(r.width),
      h: Math.round(r.height),
    };
  };

  const violations = results.violations.map((v) => ({
    id: v.id, impact: v.impact, description: v.description, help: v.help, helpUrl: v.helpUrl, tags: v.tags,
    nodes: v.nodes.map((n) => ({
      target: n.target, html: n.html, failureSummary: n.failureSummary, features: featuresOf(n.element), bbox: bboxOf(n),
    })),
  }));
  return {
    violations,
    unknown,
    axeVersion: window.axe.version,
    // Proof that the rules really ran: counts of rules that passed, need a human look, or did not apply to this page.
    stats: {
      violated: results.violations.length,
      passed: results.passes.length,
      needsReview: results.incomplete.length,
      notApplicable: results.inapplicable.length,
      rulesRun: values.length,
    },
  };
}

// page.evaluate runs through the browser's debugging channel, so a site's Content-Security-Policy cannot block it
// (addScriptTag can be blocked). addScriptTag is only the fallback.
async function injectAxe(page) {
  await page.evaluate(loadAxe());
  if (await page.evaluate(() => typeof window.axe === 'object')) return;
  await page.addScriptTag({ content: loadAxe() });
}

export async function runAxe(page) {
  await injectAxe(page);
  const raw = await page.evaluate(runInPage, SELECTED_RULES);
  return {
    findings: normalizeViolations(raw.violations),
    axeVersion: raw.axeVersion,
    rulesetId: RULESET_ID,
    stats: raw.stats,
    warnings: raw.unknown.length ? [{ code: 'UNKNOWN_RULES', rules: raw.unknown }] : [],
  };
}
