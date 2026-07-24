import { describe, expect, it } from 'vitest';
import {
  clampConcurrency,
  DEFAULT_RUNNER_CONCURRENCY,
  forEachWithConcurrency,
  MAX_RUNNER_CONCURRENCY,
} from '../lib/concurrency';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(res => (resolve = res));
  return { promise, resolve };
}

describe('clampConcurrency', () => {
  it('falls back on values that are not a usable count', () => {
    for (const value of ['', 'abc', null, undefined, 0, -3, NaN]) {
      expect(clampConcurrency(value)).toBe(DEFAULT_RUNNER_CONCURRENCY);
    }
  });

  it('caps at the maximum and truncates fractions', () => {
    expect(clampConcurrency(1000)).toBe(MAX_RUNNER_CONCURRENCY);
    expect(clampConcurrency('4')).toBe(4);
    expect(clampConcurrency(3.9)).toBe(3);
  });
});

describe('forEachWithConcurrency', () => {
  // The whole point of the fix: a 300-request collection must not open 300
  // sockets at once.
  it('never exceeds the limit', async () => {
    const items = Array.from({ length: 30 }, (_, index) => index);
    let inFlight = 0;
    let peak = 0;

    await forEachWithConcurrency(items, 4, async () => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await Promise.resolve();
      inFlight -= 1;
    });

    expect(peak).toBe(4);
  });

  it('starts the limit concurrently rather than one at a time', async () => {
    const gates = [deferred(), deferred(), deferred()];
    const started: number[] = [];

    const run = forEachWithConcurrency(gates, 2, async (gate, index) => {
      started.push(index);
      await gate.promise;
    });

    await Promise.resolve();
    expect(started).toEqual([0, 1]);

    gates[0].resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(started).toEqual([0, 1, 2]);

    gates[1].resolve();
    gates[2].resolve();
    await run;
  });

  it('processes every item exactly once, in order of dispatch', async () => {
    const items = Array.from({ length: 12 }, (_, index) => index);
    const seen: number[] = [];

    await forEachWithConcurrency(items, 3, async item => {
      seen.push(item);
    });

    expect(seen).toEqual(items);
  });

  it('handles an empty list and a limit larger than the list', async () => {
    let calls = 0;
    await forEachWithConcurrency([], 8, async () => { calls += 1; });
    expect(calls).toBe(0);

    await forEachWithConcurrency([1, 2], 50, async () => { calls += 1; });
    expect(calls).toBe(2);
  });
});
