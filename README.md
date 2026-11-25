# AccessFlow - Modules 1 and 2

Module 1: auth, projects, scan initiation and scan status/monitoring.
Module 2: accessibility analysis (axe-core), ML issue prioritisation, AI explanations, findings UI and an Admin ML evaluation page (see "Module 2" below).

v2 also stores what Playwright captured (title, language, counts, headings, screenshot) and shows it per scan.
v2 uses its own database `accessflow_v2` on port 3307, so it never touches the original `accessflow` database.

## Requirements
Node.js 20+, Docker Desktop, Git.

## First-time setup

1. Start the database (from the repo root):

       docker compose up -d

2. Server (in `server/`):

       npm install
       cp .env.example .env        # then edit JWT_ACCESS_SECRET and the admin password
       npx prisma migrate dev --name init   # creates accessflow_v2 and all tables
       npx playwright install chromium
       npm run seed:admin
       npm run dev

3. Client (in `client/`, second terminal):

       npm install
       npm run dev

Open http://localhost:5173

## Forgot password
Reset links are sent by email. For local development leave `SMTP_HOST` empty in `server/.env`:
the reset link is then printed in the server terminal instead of being emailed.
For real emails fill in `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` and `MAIL_FROM`
(any SMTP provider works; Mailtrap or Ethereal are good for testing).

If your database was created before this feature, run once in `server/`:

    npx prisma migrate dev --name add_password_reset

## Tests

    cd server
    npm test

## Notes
- If port 3306 is taken, change it in `docker-compose.yml` and `DATABASE_URL`.
- To scan a local test page, set `NODE_ENV=development` and `ALLOW_PRIVATE_TARGETS=true` in `server/.env`. Never use this in production.
- Behind a proxy (Render/Railway) set `NODE_ENV=production`.

---

# Module 2: Accessibility analysis and AI assistance

## How a scan flows now
`QUEUED → VALIDATING → RENDERING → ANALYZING → CLASSIFYING → EXPLAINING → COMPLETED` (or `COMPLETED_WITH_WARNINGS`, `FAILED`).

1. Existing URL validation, SSRF protection, timeout and concurrency limits run first (unchanged).
2. **ANALYZING**: axe-core runs on the already rendered Playwright page with a documented rule set (`server/config/axeRules.js`, 36 rules). Findings, affected nodes and WCAG criteria are stored; duplicates within a scan are removed. If axe fails the scan fails with `AXE_FAILED`.
3. **CLASSIFYING**: each finding's structured features go to the Python ML service. If it is unavailable, slow, unauthorised or returns anything invalid, the finding gets a **fallback** priority from axe impact (critical/serious → High, moderate → Medium, minor → Low), stored as `FALLBACK_AXE_IMPACT` and shown as "estimated". A fallback is never labelled as ML.
4. **EXPLAINING**: Gemini writes an explanation, user impact, suggested fix and example code from a small slice of scanner evidence. If it is unavailable or invalid, axe-core's own description is kept (`AXE_FALLBACK`).
5. A failure in step 3 or 4 never fails the scan; it ends as `COMPLETED_WITH_WARNINGS`.

Scanner impact (axe) and ML priority are stored in separate columns. AccessFlow checks a selected rule set only and never claims full WCAG compliance. Suggested fixes are suggestions, not guaranteed corrections, and nothing modifies the scanned website.

## Setup
```
# server/  (after the Module 1 setup above)
npm install                              # adds axe-core
npx prisma migrate dev --name add_module2_findings
npx prisma generate                      # stop the dev server first on Windows (file lock)
```
Add to `server/.env` (see `server/.env.example`):

| Variable | Purpose |
|---|---|
| `ML_SERVICE_URL`, `ML_SERVICE_API_KEY`, `ML_TIMEOUT_MS` | FastAPI service address, shared secret (same value as the service), request timeout. Empty URL = always use the fallback. |
| `ML_ACCEPT_DEV_MODEL` | Dev only: accept predictions from a synthetic/dev model (stored with a `+dev` version suffix). Ignored in production. |
| `LLM_PROVIDER`, `GEMINI_API_KEY`, `GEMINI_MODEL`, `LLM_TIMEOUT_MS`, `LLM_TOTAL_BUDGET_MS`, `LLM_CONCURRENCY` | LLM explanations. Empty key = axe descriptions only. The key stays on the server and is never sent to the browser. |

**Privacy:** with the LLM enabled, truncated evidence (rule, selectors, HTML snippets of up to 3 elements, form values redacted) is sent to Google. The page URL and full page are never sent. Check the provider's data terms before scanning sensitive sites.

## ML service (`ml-service/`)
Separate Python project; see `ml-service/README.md` for details.
```
cd ml-service
python -m venv .venv && .venv\Scripts\activate
pip install -r requirements.txt
set ML_SERVICE_API_KEY=<long random string>
uvicorn app.main:app --port 8000
```
The service loads `artifacts/accessflow_priority_model.joblib` once at startup. With no model it answers 503, and the Node server falls back to scanner impact. It never trains and never runs the notebook.

## Dataset, training and export
No labelled dataset exists yet, and none was found publicly (see `ml-service/data/DATA_PROVENANCE.md`). **No real model has been trained and no performance is claimed.** To produce one:

1. Collect findings from public pages (from `server/`): `node scripts/collect-dataset.js --urls ../ml-service/data/urls.txt --run-id run-01`
2. Make a blind annotation sheet and label it following `ml-service/data/ANNOTATION_GUIDELINE.md`: `python tools/make_annotation_sheet.py data/raw/run-01.jsonl data/annotations.csv`
3. Build the dataset and quality report: `python tools/build_dataset.py data/raw/run-01.jsonl data/annotations.csv --version v0.1`
4. Check `data/reports/quality_v0.1.json`. Only if every readiness gate passes are results "meaningful".
5. Train: `python tools/train.py data/dataset_v0.1.jsonl` (or run `notebooks/model_training.ipynb`). Exports `accessflow_priority_model.joblib`, `feature_schema.json`, `model_metadata.json`. Models from synthetic data or failed gates go to `artifacts/dev/` only.
6. Show the evaluation to admins (from `server/`): `node scripts/import-ml-evaluation.js ../ml-service/artifacts/model_metadata.json`, then open **ML Evaluation** in the admin sidebar.

`ml-service/tests/fixtures/synthetic_fixture.jsonl` is synthetic and exists only to test the code. Its metrics must never be reported.

## Tests
    cd server && npm test              # Module 1 + Module 2 (axe, findings API, ML client, LLM, admin ML)
    cd ml-service && pytest -q tests   # features, data tooling, training, model store, API (needs fastapi installed)

## Manual end-to-end check (needs a browser, DB and a Gemini key)
1. Start DB, server, client. Log in, create a project, run a scan on a public page with known issues.
2. With no ML service and no Gemini key: scan ends `Completed with warnings`; findings show "(estimated)" priorities and scanner descriptions.
3. Start the ML service with a dev model (`ALLOW_DEV_MODEL=true`) and set `ML_ACCEPT_DEV_MODEL=true`: priorities show "Priority predicted by the ML model" with a development-model notice.
4. Add `GEMINI_API_KEY`: findings show AI explanations, user impact, fix and example code with the disclaimer.
5. Log in as a second user: `/api/scans/<id>/findings` of the first user's scan returns 404. As a normal user, `/api/admin/ml/evaluations` returns 403.
6. As admin, open **ML Evaluation**: empty state before any import; red synthetic banner without metrics after importing a dev model.

## Security notes
JWT auth, ownership checks (findings are only reachable through the owner's scan), SSRF guard, rate limits, scan timeout and concurrency are unchanged. ML service calls use a shared secret header and refuse redirects. All ML and LLM replies are validated before use; scanner HTML is treated as untrusted data in prompts. Screenshot files now have unguessable names (older `scan-<id>.jpg` files remain guessable; delete or rename them if that matters). Internal ML diagnostics are not returned to users.

## Trying the scanner on a page that has problems
`https://example.com` has almost nothing for axe-core to report, so 0 findings there is normal. To see real findings, scan a page that is built to be inaccessible, for example (check they are still online):
- https://www.w3.org/WAI/demos/bad/before/home.html (W3C "Before and After Demonstration")
- https://broken-workshop.dequelabs.com/ (Deque training site)
- https://dequeuniversity.com/demo/mars (Deque Mars demo)

The scan report (`/scans/:id`) always shows how many of the selected rules passed, so you can see axe-core really ran even when the page has no issues.
AI-written fixes appear only when `GEMINI_API_KEY` is set in `server/.env`; without it the report shows axe-core's own fix guidance.
Screenshots are saved in `server/uploads/screenshots` (not part of the zip): copy that folder along if you move the project, otherwise old scans show "screenshot missing".

## AI feedback and scan comparison
- Every explanation / fix on a scan report has "Was this helpful?" buttons. Ratings (with an optional reason and comment) are stored in `ExplanationFeedback`, one per user per explanation.
- Admin -> "AI Quality" shows the helpful rate overall, for Gemini vs scanner guidance, the reasons given, and the rules with the most negative ratings. These are user opinions, not ground truth.
- A scan report compares the scan with the previous one of the same project (resolved, fewer elements, unchanged, more elements, new), so a user can check whether a suggested fix really worked.
- New table, so run `npx prisma migrate dev --name add_explanation_feedback` and `npx prisma generate` in `server` after updating.
