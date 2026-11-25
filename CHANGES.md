# Module 2 UI upgrade: what changed

## You must run this once (new database column)
    cd server && npx prisma generate && npx prisma db push
Then run a NEW scan: the annotated screenshot needs element positions, which old scans do not have
(they still open fine, with a note instead of markers).

## Features
1. Score gauge (0-100, grade A-F, change since previous scan): server/services/score.js, client ScoreGauge.jsx
2. Annotated screenshot with numbered markers: server saves FindingNode.bbox; client AnnotatedSnapshot.jsx
3. "Fix these first" top-3 card with Copy fix: FixFirst.jsx
4. Before/after code diff with highlighting: CodeDiff.jsx, CodeBlock.jsx
5. Live scan stepper: ScanProgress.jsx (report page and project scan list)
6. Skeleton loaders and empty states: Skeleton.jsx, EmptyState.jsx
7. Filters: priority, WCAG principle, rule, search, expand/collapse all, active-filter count
8. Dark mode toggle (header): ThemeContext.jsx + overrides in index.css (sign-in pages stay light)
9. Toasts (Toast.jsx) and confetti when a scan has no high-priority issues (once per scan per session)
10. WCAG principle radar chart (replaces the third bar chart)
11. ML confidence meter with "what the model looked at"
12. Compare two scans: GET /api/scans/:id/compare/:otherId, ComparePage.jsx
13. Export report: "Export as PDF" opens the print dialog (Save as PDF); all findings are expanded
14. Admin AI Quality: helpful-rate-per-day line chart and complaint word list

## Not done, on purpose
- "Hide passed" filter: the findings list only contains failed rules, so there is nothing passed to hide.
- Shareable public link: needs an access-token design (who may open it, expiry). Export as PDF covers sharing for now.
- "Why this priority": the ML model does not report per-prediction feature weights, so the UI lists the inputs the
  model received and says so, instead of inventing a ranking.

## Tests
Server: 126 passing (20 new: score, compare, bbox, trend, word list). Run `cd server && npm test`.
