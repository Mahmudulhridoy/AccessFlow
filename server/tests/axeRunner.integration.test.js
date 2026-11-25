// Real browser + real axe-core. Skipped automatically if Chromium cannot launch.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { chromium } from 'playwright';
import { runAxe } from '../services/axeRunner.js';

let browser;
beforeAll(async () => {
  try { browser = await chromium.launch(); } catch { browser = null; }
});
afterAll(async () => { await browser?.close(); });

const analyse = async (html) => {
  const page = await browser.newPage();
  try {
    await page.setContent(html);
    return await runAxe(page);
  } finally {
    await page.close();
  }
};

describe('axe-core integration (real page)', () => {
  it('detects a known violation (image without alt)', async (ctx) => {
    if (!browser) return ctx.skip();
    const r = await analyse('<html lang="en"><head><title>t</title></head><body><main><h1>Hi</h1><img src="x.png"></main></body></html>');
    const f = r.findings.find((x) => x.ruleId === 'image-alt');
    expect(f).toBeDefined();
    expect(f.axeImpact).toBe('CRITICAL');
    expect(f.wcag[0].criterion).toBe('1.1.1');
    expect(f.nodes[0].tag).toBe('img');
    expect(r.rulesetId).toBe('accessflow-core-v1');
  });

  it('returns no findings for a clean page', async (ctx) => {
    if (!browser) return ctx.skip();
    const r = await analyse('<html lang="en"><head><title>Clean</title></head><body><main><h1>Hello</h1><p>Text</p><a href="/a">About us</a></main></body></html>');
    expect(r.findings).toEqual([]);
  });

  it('stores multiple distinct violations', async (ctx) => {
    if (!browser) return ctx.skip();
    const r = await analyse('<html><head></head><body><main><img src="x.png"><button></button><a href="/x"></a></main></body></html>');
    const ids = r.findings.map((x) => x.ruleId);
    expect(ids).toEqual(expect.arrayContaining(['image-alt', 'button-name', 'link-name', 'document-title', 'html-has-lang']));
    expect(new Set(r.findings.map((x) => x.dedupeKey)).size).toBe(r.findings.length);
  });
});
