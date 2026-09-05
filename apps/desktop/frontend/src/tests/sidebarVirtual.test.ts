import { describe, it, expect } from 'vitest';
import { virtualizeRows, type VirtualRow } from '../lib/sidebarVirtual';

const OVERSCAN = 60;
const MIN = 30;

function rows(heights: number[]): VirtualRow[] {
  return heights.map((height, i) => ({ key: `r${i}`, height }));
}

function uniform(count: number, height: number): VirtualRow[] {
  return rows(Array.from({ length: count }, () => height));
}

describe('virtualizeRows', () => {
  it('reports the full content height regardless of scroll position', () => {
    const list = uniform(100, 30);
    const total = 100 * 30;
    for (const scrollTop of [0, 750, 1500, 2700]) {
      const win = virtualizeRows(list, scrollTop, 300, OVERSCAN, MIN);
      expect(win.totalHeight).toBe(total);
    }
  });

  it('keeps before + visible + after === totalHeight at every scroll position (no gaps, no overlap)', () => {
    const list = rows([200, 30, 30, 124, 30, 30, 58, 30, 30, 30, 30, 78, 30, 30, 30, 30, 30, 30]);
    const total = list.reduce((t, r) => t + r.height, 0);
    for (let scrollTop = 0; scrollTop <= total; scrollTop += 17) {
      const win = virtualizeRows(list, scrollTop, 250, OVERSCAN, MIN);
      const visibleHeight = win.rows.reduce((t, r) => t + r.height, 0);
      expect(win.before + visibleHeight + win.after).toBe(total);
      expect(win.before).toBeGreaterThanOrEqual(0);
      expect(win.after).toBeGreaterThanOrEqual(0);
    }
  });

  it('renders the top rows with no leading spacer at scrollTop 0', () => {
    const win = virtualizeRows(uniform(100, 30), 0, 300, OVERSCAN, MIN);
    expect(win.before).toBe(0);
    expect(win.rows[0].key).toBe('r0');
  });

  it('renders the last rows with zero trailing spacer at the bottom (no phantom panel)', () => {
    const list = uniform(100, 30);
    const total = 100 * 30;
    const viewport = 300;
    const win = virtualizeRows(list, total - viewport, viewport, OVERSCAN, MIN);
    expect(win.rows.at(-1)!.key).toBe('r99');
    expect(win.after).toBe(0);
  });

  it('uses measured heights instead of estimates, so spacers match the real DOM', () => {
    const list = uniform(10, 30);
    const measured = new Map(list.map(r => [r.key, 80]));
    const win = virtualizeRows(list, 0, 250, OVERSCAN, MIN, measured);
    expect(win.totalHeight).toBe(10 * 80);
  });

  it('mixes measured and estimated heights during progressive measurement', () => {
    const list = uniform(10, 30);
    const measured = new Map<string, number>();
    measured.set('r0', 100);
    measured.set('r1', 100);
    const win = virtualizeRows(list, 0, 250, OVERSCAN, MIN, measured);
    expect(win.totalHeight).toBe(2 * 100 + 8 * 30);
  });

  it('eliminates the phantom panel when an estimate over-counted the real height', () => {
    const list = rows([124, 124, 124, 124, 124]);
    const measured = new Map(list.map(r => [r.key, 80]));
    const viewport = 200;
    const total = 5 * 80;
    const win = virtualizeRows(list, total - viewport, viewport, OVERSCAN, MIN, measured);
    expect(win.totalHeight).toBe(total);
    expect(win.rows.at(-1)!.key).toBe('r4');
    expect(win.after).toBe(0);
  });

  it('handles an empty list', () => {
    const win = virtualizeRows([], 0, 300, OVERSCAN, MIN);
    expect(win).toEqual({ rows: [], before: 0, after: 0, totalHeight: 0 });
  });

  it('includes overscan rows above and below the viewport', () => {
    const list = uniform(100, 30);
    const noOverscan = virtualizeRows(list, 900, 300, 0, MIN);
    const withOverscan = virtualizeRows(list, 900, 300, OVERSCAN, MIN);
    expect(withOverscan.rows.length).toBeGreaterThan(noOverscan.rows.length);
  });
});
