export const DEFAULT_RUNNER_CONCURRENCY = 8;
export const MIN_RUNNER_CONCURRENCY = 1;
export const MAX_RUNNER_CONCURRENCY = 64;

export function clampConcurrency(value: unknown, fallback = DEFAULT_RUNNER_CONCURRENCY) {
  const parsed = Math.floor(Number(value));
  if (!Number.isFinite(parsed) || parsed < MIN_RUNNER_CONCURRENCY) return fallback;
  return Math.min(parsed, MAX_RUNNER_CONCURRENCY);
}

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
