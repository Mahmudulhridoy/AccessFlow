# Data provenance and licensing

## Public sources reviewed (2026-11-17) — none used as training data
| Source | Finding | Status |
|---|---|---|
| Kaggle "Web Accessibility Compliance Dataset" (vaishnavikamdi725) | Described as axe-core audits of 50 sites; columns, licence and labels could not be verified | Not used |
| github.com/toyosi12/ai4se (arXiv 2605.27716) | 662 pages, binary violation/clean; impact from axe; no licence stated | Not used |
| WebAIM Million | Aggregate WAVE statistics; no per-page download or data licence found | Context only |
| a11yscope 244-site study | Severity = axe impact (not human); no data release | Not used |
| HTTP Archive | Terms/schema not verified | Possible URL sampling frame after verification |

## Our collection (fill in per run — do not leave blank values implied)
| Field | Value |
|---|---|
| Run ID | |
| Collection dates | |
| URL source / sampling frame (and its licence/terms) | |
| Number of URLs / pages loaded / skipped (robots, errors) | |
| axe-core version, ruleset ID | |
| Annotator(s), guideline version, labelling dates | |
| Re-label (pass 2) sample size and weighted κ | |

## Handling rules
- One page load per URL, `robots.txt` respected, ≥ 3 s between requests, public pages only, no logins.
- Only derived facts and ≤ 500-char HTML snippets (form values redacted) are stored; full pages are never stored.
- `data/raw/`, `data/private/` (crops) and built datasets are git-ignored. Do not redistribute third-party content.
