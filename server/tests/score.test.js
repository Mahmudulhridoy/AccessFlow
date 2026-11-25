import { describe, it, expect } from 'vitest';
import { computeScore, gradeFor, scoreBlock } from '../services/score.js';

describe('accessibility score', () => {
  it('is 100 (grade A) when no rule failed', () => {
    expect(computeScore([])).toEqual({ value: 100, grade: 'A' });
  });

  it('drops more for high priority than for low priority', () => {
    const high = computeScore([{ nodeCount: 1, priority: 'HIGH' }]).value;
    const low = computeScore([{ nodeCount: 1, priority: 'LOW' }]).value;
    expect(high).toBeLessThan(low);
  });

  it('drops more when more elements are affected, but stops growing at a cap', () => {
    const one = computeScore([{ nodeCount: 1, priority: 'MEDIUM' }]).value;
    const many = computeScore([{ nodeCount: 20, priority: 'MEDIUM' }]).value;
    const huge = computeScore([{ nodeCount: 5000, priority: 'MEDIUM' }]).value;
    expect(many).toBeLessThan(one);
    expect(huge).toBe(many);
  });

  it('treats a finding with no priority as medium instead of ignoring it', () => {
    expect(computeScore([{ nodeCount: 1 }])).toEqual(computeScore([{ nodeCount: 1, priority: 'MEDIUM' }]));
  });

  it('never goes below 0 or above 100', () => {
    const awful = computeScore(Array.from({ length: 200 }, () => ({ nodeCount: 50, priority: 'HIGH' })));
    expect(awful.value).toBeGreaterThanOrEqual(0);
    expect(awful.grade).toBe('F');
  });

  it('maps values to letter grades at the boundaries', () => {
    expect([100, 90, 89, 80, 79, 70, 69, 60, 59, 0].map(gradeFor)).toEqual(['A', 'A', 'B', 'B', 'C', 'C', 'D', 'D', 'F', 'F']);
  });

  it('reports the change since the previous scan, or nothing for a first scan', () => {
    const now = [{ nodeCount: 1, priority: 'LOW' }];
    const before = [{ nodeCount: 1, priority: 'HIGH' }, { nodeCount: 2, priority: 'MEDIUM' }];
    const block = scoreBlock(now, before, 7);
    expect(block.previous.scanId).toBe(7);
    expect(block.delta).toBe(block.value - block.previous.value);
    expect(block.delta).toBeGreaterThan(0);
    expect(scoreBlock(now, [], null)).toMatchObject({ previous: null, delta: null });
  });
});
