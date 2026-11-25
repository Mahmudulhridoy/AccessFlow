import { describe, it, expect } from 'vitest';
import { normalizeViolations, parseWcag, dedupeKey, cleanBbox } from '../services/axeNormalize.js';

const violation = (over = {}) => ({
  id: 'image-alt', impact: 'critical', description: 'Images must have alternate text',
  help: 'Images must have alternate text', helpUrl: 'https://dequeuniversity.com/rules/axe/4.10/image-alt',
  tags: ['cat.text-alternatives', 'wcag2a', 'wcag111'],
  nodes: [{ target: ['img'], html: '<img src="a.png">', failureSummary: 'Fix any of the following', features: { tag: 'img', isInteractive: false, landmark: 'main' } }],
  ...over,
});

describe('axe normalisation', () => {
  it('parses WCAG criteria and level from axe tags', () => {
    expect(parseWcag(['wcag2aa', 'wcag143'])).toEqual([{ criterion: '1.4.3', level: 'AA' }]);
    expect(parseWcag(['wcag2a', 'wcag1410'])).toEqual([{ criterion: '1.4.10', level: 'A' }]);
    expect(parseWcag(['best-practice', 'cat.aria'])).toEqual([]);
  });

  it('returns an empty list when there are no violations', () => {
    expect(normalizeViolations([])).toEqual([]);
  });

  it('keeps scanner impact separately and stores node evidence', () => {
    const [f] = normalizeViolations([violation()]);
    expect(f.axeImpact).toBe('CRITICAL');
    expect(f.nodeCount).toBe(1);
    expect(f.nodes[0]).toMatchObject({ selector: 'img', tag: 'img', landmark: 'main' });
    expect(f.wcag).toEqual([{ criterion: '1.1.1', level: 'A' }]);
  });

  it('stores several different violations', () => {
    const out = normalizeViolations([violation(), violation({ id: 'button-name', impact: 'serious', nodes: [{ target: ['#b'], html: '<button id="b"></button>' }] })]);
    expect(out.map((f) => f.ruleId)).toEqual(['image-alt', 'button-name']);
  });

  it('removes duplicate findings within a scan', () => {
    expect(normalizeViolations([violation(), violation()])).toHaveLength(1);
    expect(dedupeKey('a', ['x', 'y'])).toBe(dedupeKey('a', ['y', 'x']));
  });

  it('skips malformed entries, tolerates unknown impact, and rejects non-arrays', () => {
    const out = normalizeViolations([null, { id: 5 }, violation({ impact: 'weird' })]);
    expect(out).toHaveLength(1);
    expect(out[0].axeImpact).toBeNull();
    expect(() => normalizeViolations('nope')).toThrow();
  });

  it('redacts form values and caps stored nodes while keeping the true count', () => {
    const nodes = Array.from({ length: 60 }, (_, i) => ({ target: [`#n${i}`], html: '<input value="secret">' }));
    const [f] = normalizeViolations([violation({ nodes })]);
    expect(f.nodeCount).toBe(60);
    expect(f.nodes).toHaveLength(50);
    expect(f.nodes[0].htmlSnippet).not.toContain('secret');
  });

  it('joins shadow DOM / iframe selector paths', () => {
    const [f] = normalizeViolations([violation({ nodes: [{ target: ['iframe', ['#host', 'button']], html: '<button>' }] })]);
    expect(f.nodes[0].selector).toBe('iframe >> #host >> button');
  });
});

describe('element bounding boxes', () => {
  it('keeps a valid box on the node and leaves the key out when there is none', () => {
    const [withBox] = normalizeViolations([violation({ nodes: [{ target: ['img'], html: '<img>', bbox: { x: 10.4, y: 20, w: 100, h: 50 } }] })]);
    expect(withBox.nodes[0].bbox).toEqual({ x: 10, y: 20, w: 100, h: 50 });
    const [without] = normalizeViolations([violation()]);
    expect('bbox' in without.nodes[0]).toBe(false);
  });

  it('drops boxes that are empty, negative, not numbers or absurdly large', () => {
    expect(cleanBbox(null)).toBeUndefined();
    expect(cleanBbox({ x: 0, y: 0, w: 0, h: 5 })).toBeUndefined();
    expect(cleanBbox({ x: -5, y: 0, w: 5, h: 5 })).toBeUndefined();
    expect(cleanBbox({ x: 'a', y: 0, w: 5, h: 5 })).toBeUndefined();
    expect(cleanBbox({ x: 0, y: 0, w: 1e9, h: 5 })).toBeUndefined();
  });
});
