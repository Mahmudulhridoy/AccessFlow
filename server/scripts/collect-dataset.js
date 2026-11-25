// Collects UNLABELLED accessibility findings from public pages for the ML dataset.
// Uses the same SSRF checks and the same axe runner as production scans.
//
//   node scripts/collect-dataset.js --urls ../ml-service/data/urls.txt --run-id run-2026-11-a [--delay 3000]
//
// urls.txt: one public http(s) URL per line ('#' comments allowed). One page load per URL, no crawling.
// Output: ../ml-service/data/raw/<run-id>.jsonl (findings, no labels) and
//         ../ml-service/data/private/<run-id>/<finding_id>.png (element crops for annotators; never commit).
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';
import { assertSafeUrl } from '../services/ssrf.js';
import { newGuardedContext } from '../services/guardedContext.js';
import { runAxe } from '../services/axeRunner.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const ML = path.resolve(here, '../../ml-service/data');
const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : fallback;
};

const urlsFile = arg('urls');
const runId = arg('run-id');
const delay = Number(arg('delay', 3000));
if (!urlsFile || !runId || !/^[\w.-]+$/.test(runId)) {
  console.error('Usage: node scripts/collect-dataset.js --urls <file> --run-id <id> [--delay ms]');
  process.exit(1);
}

const MULTI = new Set(['co', 'com', 'org', 'net', 'gov', 'edu', 'ac']);
function registrableDomain(host) {
  const p = host.toLowerCase().split('.');
  if (p.length <= 2) return host.toLowerCase();
  return (p.at(-1).length === 2 && MULTI.has(p.at(-2)) ? p.slice(-3) : p.slice(-2)).join('.');
}

// Minimal robots.txt check for the generic user-agent: skip the page if its path is disallowed.
async function robotsAllows(url) {
  try {
    const u = new URL(url);
    const res = await fetch(`${u.origin}/robots.txt`, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return true;
    let applies = false;
    for (const raw of (await res.text()).split('\n')) {
      const line = raw.split('#')[0].trim();
      const [k, ...rest] = line.split(':');
      const v = rest.join(':').trim();
      if (/^user-agent$/i.test(k)) applies = v === '*';
      else if (applies && /^disallow$/i.test(k) && v && (u.pathname || '/').startsWith(v)) return false;
    }
    return true;
  } catch {
    return true; // unreachable robots.txt is treated as no restriction
  }
}

const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const urls = fs.readFileSync(urlsFile, 'utf8').split('\n').map((l) => l.split('#')[0].trim()).filter(Boolean);
const rawDir = path.join(ML, 'raw');
const cropDir = path.join(ML, 'private', runId);
fs.mkdirSync(rawDir, { recursive: true });
fs.mkdirSync(cropDir, { recursive: true });
const out = fs.createWriteStream(path.join(rawDir, `${runId}.jsonl`), { flags: 'a' });

const browser = await chromium.launch();
const summary = { pages: 0, findings: 0, skipped: [] };

for (const url of urls) {
  let context;
  try {
    await assertSafeUrl(url);
    if (!(await robotsAllows(url))) { summary.skipped.push([url, 'ROBOTS_DISALLOW']); continue; }

    const guarded = await newGuardedContext(browser);
    context = guarded.context;
    const page = await context.newPage();
    const res = await page.goto(url, { waitUntil: 'load', timeout: 30000 });
    await page.waitForTimeout(1000);
    if (!res || res.status() >= 400 || !/text\/html/i.test(res.headers()['content-type'] || '')) {
      summary.skipped.push([url, `HTTP_${res?.status() ?? 'NONE'}`]);
      continue;
    }

    const analysis = await runAxe(page);
    const finalUrl = page.url();
    const domain = registrableDomain(new URL(finalUrl).hostname);

    for (const f of analysis.findings) {
      const findingId = crypto.createHash('sha256').update(`${runId}|${finalUrl}|${f.ruleId}|${f.dedupeKey}`).digest('hex').slice(0, 16);
      out.write(JSON.stringify({
        finding_id: findingId, data_origin: 'own_collected', collection_run_id: runId,
        collected_at: new Date().toISOString(), page_url: finalUrl, registrable_domain: domain,
        axe_version: analysis.axeVersion, ruleset_id: analysis.rulesetId,
        rule_id: f.ruleId, axe_impact: f.axeImpact?.toLowerCase() ?? null, axe_description: f.description,
        help_url: f.helpUrl, tags: f.tags, wcag_criteria: f.wcag, node_count: f.nodeCount,
        page_finding_count: analysis.findings.length, dedupe_key: f.dedupeKey,
        nodes: f.nodes.map((n) => ({
          selector: n.selector, html_snippet: n.htmlSnippet, tag: n.tag, role: n.role,
          is_interactive: n.isInteractive, landmark: n.landmark, failure_summary: n.failureSummary,
        })),
      }) + '\n');

      // Element crop for the human annotator (private, local only). Best effort.
      const sel = f.nodes[0]?.selector;
      if (sel && !sel.includes(' >> ')) {
        await page.locator(sel).first().screenshot({ path: path.join(cropDir, `${findingId}.png`), timeout: 3000 }).catch(() => {});
      }
    }
    summary.pages += 1;
    summary.findings += analysis.findings.length;
    console.log(`ok  ${url}  ${analysis.findings.length} findings`);
  } catch (err) {
    summary.skipped.push([url, err.code || err.name || 'ERROR']);
    console.log(`skip ${url}  ${err.code || err.message}`);
  } finally {
    await context?.close().catch(() => {});
  }
  await pause(delay);
}

await browser.close();
out.end();
console.log(JSON.stringify(summary, null, 2));
