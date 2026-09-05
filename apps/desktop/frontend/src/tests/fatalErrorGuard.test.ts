import { describe, expect, it } from 'vitest';
import {
  ERROR_STORM_THRESHOLD,
  ERROR_STORM_WINDOW_MS,
  classifyFatalError,
  stormOverlayMessage,
} from '../lib/fatalError';

function burst(count: number, options: { message?: string; spacingMs?: number; startAt?: number } = {}) {
  const { message = 'TypeError: x is not a function', spacingMs = 10, startAt = 1_000_000 } = options;
  let recent: number[] = [];
  const verdicts: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const result = classifyFatalError(message, recent, startAt + i * spacingMs);
    recent = result.recent;
    verdicts.push(result.verdict);
  }
  return { verdicts, recent };
}

describe('fatal error guard', () => {
  const now = 1_000_000;

  it('ignores the noise that does not mean anything is broken', () => {
    for (const message of [
      'ResizeObserver loop completed with undelivered notifications.',
      '[vite] connecting...',
      'Failed to fetch dynamically imported module: /src/x.js',
    ]) {
      expect(classifyFatalError(message, [], now).verdict).toBe('ignore');
    }
  });

  it('ignores an empty message', () => {
    expect(classifyFatalError('', [], now).verdict).toBe('ignore');
  });

  it('treats a wedged Svelte scheduler as immediately fatal', () => {
    for (const message of [
      'Svelte error: effect_update_depth_exceeded',
      'Maximum update depth exceeded',
      'https://svelte.dev/e/effect_update_depth_exceeded',
    ]) {
      expect(classifyFatalError(message, [], now).verdict).toBe('fatal');
    }
  });

  it('does not count a fatal or ignored error towards the storm window', () => {
    const recent = [now - 5, now - 4, now - 3];
    expect(classifyFatalError('effect_update_depth_exceeded', recent, now).recent).toEqual(recent);
    expect(classifyFatalError('[vite] reload', recent, now).recent).toEqual(recent);
  });

  it('watches an ordinary error without showing anything', () => {
    const { verdicts } = burst(ERROR_STORM_THRESHOLD - 1);
    expect(verdicts.every(verdict => verdict === 'watch')).toBe(true);
  });

  it('calls a storm at the threshold, not before it', () => {
    const { verdicts } = burst(ERROR_STORM_THRESHOLD);
    expect(verdicts.slice(0, -1).every(verdict => verdict === 'watch')).toBe(true);
    expect(verdicts.at(-1)).toBe('storm');
  });

  it('lets a slow trickle of errors go by', () => {
    const { verdicts, recent } = burst(ERROR_STORM_THRESHOLD * 2, { spacingMs: ERROR_STORM_WINDOW_MS });
    expect(verdicts).not.toContain('storm');
    expect(recent).toHaveLength(1);
  });

  it('drops timestamps that fall out of the window', () => {
    const stale = [now - ERROR_STORM_WINDOW_MS - 1, now - ERROR_STORM_WINDOW_MS];
    const fresh = now - 1;
    const result = classifyFatalError('boom', [...stale, fresh], now);
    expect(result.recent).toEqual([fresh, now]);
  });

  it('keeps the triggering error in the storm overlay text', () => {
    const message = 'TypeError: cannot read properties of undefined';
    expect(stormOverlayMessage(message)).toContain(message);
    expect(stormOverlayMessage(message)).toContain('became unresponsive');
  });
});
