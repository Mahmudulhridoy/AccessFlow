# AccessFlow Priority Annotation Guideline — v0.1

**Goal:** label each finding High, Medium or Low by *how urgently a developer should fix it*, judged from the
effect on real users. This is **not** axe-core's impact level, and the rule ID alone is **not** the label.

You do not see axe impact or any model output while labelling (blind labelling), so the label is your own judgement.

## What you see
Rule description, WCAG criterion, page URL, number of affected elements, up to 3 selectors + HTML snippets,
and an element crop image (`data/private/<run>/<crop_file>`). Open the page when the crop is not enough.

## Three questions
1. **Barrier** — for a user of a screen reader, keyboard only, magnification or low vision: does this *block* a task, *hinder* it, or only *annoy*?
2. **Criticality** — is the element on a core task path (navigation, forms/inputs, primary actions, main content) or peripheral/decorative?
3. **Reach** — one isolated instance, or a repeated/sitewide pattern (use `node_count` and what you see on the page)?

## Labels
| Label | Use when |
|---|---|
| **High** | Blocks or severely hinders a core task for some users and there is no practical workaround (e.g. an unlabelled primary form field, a nameless main button, text that cannot be read at all). Fix first. |
| **Medium** | Causes real difficulty, but a workaround exists, or the element is not on a core path, or the barrier is partial (e.g. low-but-readable contrast on body text, a missing landmark on a simple page). |
| **Low** | Minor annoyance, best-practice or redundancy issue, or an element that very unlikely affects task completion (e.g. heading level skipped on a simple page, decorative element). |

Tie-breaks: if torn between two adjacent labels, choose the **lower** one and set `confidence` to 1 or 2. Never choose by copying what you
think axe would say.

## Flags (use instead of guessing)
- `none` — normal, labelled.
- `unsure` — you cannot decide after opening the page.
- `needs_context` — judgement depends on something you cannot see (e.g. content behind login).
- `false_positive` — the scanner is clearly wrong here.
Flagged rows are **excluded** from training and counted in the quality report.

## Columns you fill
`priority` (High/Medium/Low), `flag`, `confidence` (1 low – 3 high), `rationale` (one line; **required for High**),
`annotator_id`, `labeled_at`. Leave other columns unchanged. Keep `pass` = 1 for the first pass.

## Process (single annotator)
1. **Calibration:** label the first 30 rows, then re-read this guideline and write down any rule you wanted but did not have. Update the guideline (bump the version, keep a change log below) and re-label those 30.
2. **Main pass:** label everything in the shuffled sheet. Do not sort by rule or by site.
3. **Consistency pass:** at least 7 days later, run `make_annotation_sheet.py --relabel 0.15 --labelled annotations.csv`, label the new sheet **without looking at your earlier labels**, `pass` = 2. `build_dataset.py` reports weighted κ (target ≥ 0.6). If lower, refine the guideline and re-label.
4. **Optional external check:** have someone with accessibility experience label ~50 random findings (pass = 3, different `annotator_id`) and report agreement as a limitation/validation, not as ground truth.

## Known limitation (state this in the report)
Labels reflect **one annotator's** policy-based judgement. Model results can only claim agreement with this policy.

## Change log
- v0.1 — initial draft (not yet calibrated).
