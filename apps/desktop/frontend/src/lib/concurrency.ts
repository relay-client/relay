// How many requests the collection runner sends at once in parallel mode.
// Unbounded parallelism (what `Promise.all` over the whole batch gives you)
// turns a 300-request collection into 300 simultaneous sockets: the target
// server sees an accidental flood, and the client trips its own file-descriptor
// limits, so requests fail for reasons that have nothing to do with the API.
export const DEFAULT_RUNNER_CONCURRENCY = 8;
export const MIN_RUNNER_CONCURRENCY = 1;
export const MAX_RUNNER_CONCURRENCY = 64;

export function clampConcurrency(value: unknown, fallback = DEFAULT_RUNNER_CONCURRENCY) {
  const parsed = Math.floor(Number(value));
  if (!Number.isFinite(parsed) || parsed < MIN_RUNNER_CONCURRENCY) return fallback;
  return Math.min(parsed, MAX_RUNNER_CONCURRENCY);
}

/**
 * Runs `worker` over every item with at most `limit` in flight at a time.
 * Items are handed out in order; completion order depends on how long each
 * one takes. Rejections propagate like `Promise.all`.
 */
export async function forEachWithConcurrency<T>(
  items: readonly T[],
  limit: number,
  worker: (item: T, index: number) => Promise<void>,
): Promise<void> {
  const total = items.length;
  if (total === 0) return;

  const lanes = Math.max(1, Math.min(clampConcurrency(limit), total));
  let cursor = 0;

  const runLane = async () => {
    while (cursor < total) {
      const index = cursor;
      cursor += 1;
      await worker(items[index], index);
    }
  };

  await Promise.all(Array.from({ length: lanes }, runLane));
}
