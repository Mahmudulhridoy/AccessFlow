// Pure helpers (no browser, no axe import) so they can be unit tested and reused by the dataset collector.
import crypto from 'crypto';

const MAX_NODES_STORED = 50;
const IMPACTS = new Set(['MINOR', 'MODERATE', 'SERIOUS', 'CRITICAL']);

const clip = (value, max) => (typeof value === 'string' ? value.slice(0, max) : null);

// axe tag "wcag143" -> "1.4.3", "wcag1410" -> "1.4.10", "wcag2411" -> "2.4.11"
export function parseWcag(tags = []) {
  const levelTag = tags.find((t) => /^wcag\d+(a|aa|aaa)$/.test(t));
  const level = levelTag ? levelTag.match(/(a{1,3})$/)[1].toUpperCase() : null;
  const criteria = [];
  for (const tag of tags) {
    const m = /^wcag(\d)(\d)(\d{1,2})$/.exec(tag);
    if (m) criteria.push({ criterion: `${m[1]}.${m[2]}.${Number(m[3])}`, level });
  }
  return criteria;
}

const flattenTarget = (target = []) =>
  target.map((part) => (Array.isArray(part) ? part.join(' >> ') : String(part))).join(' >> ');

// A box is kept only if it is four finite, sane numbers; anything else is dropped (the marker is simply not drawn).
const MAX_COORD = 100_000;
export function cleanBbox(b) {
  if (!b || typeof b !== 'object') return undefined;
  const { x, y, w, h } = b;
  const ok = [x, y, w, h].every((n) => Number.isFinite(n) && Math.abs(n) <= MAX_COORD);
  return ok && w > 0 && h > 0 && x >= 0 && y >= 0 ? { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) } : undefined;
}

// Avoid keeping form values or other typed content from the scanned page.
const redact = (html) => html.replace(/\bvalue\s*=\s*("[^"]*"|'[^']*')/gi, 'value="[redacted]"');

export const dedupeKey = (ruleId, selectors) =>
  crypto.createHash('sha256').update(`${ruleId}|${[...selectors].sort().join('|')}`).digest('hex');

export function normalizeViolations(violations) {
  if (!Array.isArray(violations)) throw new Error('axe violations is not an array');
  const seen = new Set();
  const findings = [];

  for (const v of violations) {
    if (!v || typeof v.id !== 'string' || !Array.isArray(v.nodes)) continue; // malformed entry
    const selectors = v.nodes.map((n) => flattenTarget(n.target));
    const key = dedupeKey(v.id, selectors);
    if (seen.has(key)) continue;
    seen.add(key);

    const impact = typeof v.impact === 'string' ? v.impact.toUpperCase() : null;
    const tags = Array.isArray(v.tags) ? v.tags.filter((t) => typeof t === 'string') : [];

    findings.push({
      ruleId: clip(v.id, 100),
      axeImpact: IMPACTS.has(impact) ? impact : null,
      description: clip(v.description, 5000) || v.id,
      help: clip(v.help, 500),
      helpUrl: clip(v.helpUrl, 2048),
      tags,
      nodeCount: v.nodes.length,
      dedupeKey: key,
      wcag: parseWcag(tags),
      nodes: v.nodes.slice(0, MAX_NODES_STORED).map((n, i) => ({
        ...(cleanBbox(n.bbox) ? { bbox: cleanBbox(n.bbox) } : {}),
        ordinal: i,
        selector: selectors[i] || '(unknown)',
        htmlSnippet: redact(clip(n.html, 500) || ''),
        tag: clip(n.features?.tag, 30),
        role: clip(n.features?.role, 40),
        isInteractive: n.features?.isInteractive === true,
        landmark: clip(n.features?.landmark, 30),
        failureSummary: clip(n.failureSummary, 1000),
      })),
    });
  }
  return findings;
}
