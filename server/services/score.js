// The accessibility score shown at the top of a scan report.
//
// It is an AccessFlow summary of what the automated rules found on ONE page, so scans of the same page can be compared.
// It is NOT a WCAG conformance score and a 100 does not mean the page is accessible (automated rules cannot check everything).
//
// How it works: every issue adds a penalty by priority, a little more when many elements are affected, and the penalty is
// turned into a 0-100 number that never goes below 0 and falls more slowly as a page gets worse.
export const PRIORITY_WEIGHT = { HIGH: 10, MEDIUM: 5, LOW: 2 };
const UNPRIORITISED_WEIGHT = PRIORITY_WEIGHT.MEDIUM; // a finding without a priority is treated as medium, not ignored
const ELEMENT_CAP = 20; // elements beyond this add nothing more, so one noisy rule cannot dominate
const SOFTNESS = 70;

export const GRADES = [
  [90, 'A'],
  [80, 'B'],
  [70, 'C'],
  [60, 'D'],
  [0, 'F'],
];

export const gradeFor = (value) => GRADES.find(([min]) => value >= min)[1];

/** items: [{ nodeCount, priority }] (priority is HIGH | MEDIUM | LOW or missing). */
export function computeScore(items) {
  let penalty = 0;
  for (const item of items) {
    const weight = PRIORITY_WEIGHT[item.priority] ?? UNPRIORITISED_WEIGHT;
    const spread = Math.min(Math.max(item.nodeCount || 1, 1), ELEMENT_CAP) / ELEMENT_CAP; // 0..1
    penalty += weight * (1 + 0.5 * spread);
  }
  const value = Math.round(100 * Math.exp(-penalty / SOFTNESS));
  return { value, grade: gradeFor(value) };
}

/** Builds the score block of the findings response, with the change since the previous scan when there is one. */
export function scoreBlock(current, previous, previousScanId) {
  const now = computeScore(current);
  if (!previousScanId || !previous) return { ...now, previous: null, delta: null };
  const before = computeScore(previous);
  return { ...now, previous: { scanId: previousScanId, value: before.value, grade: before.grade }, delta: now.value - before.value };
}
