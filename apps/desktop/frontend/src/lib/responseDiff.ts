// Line diff between two response bodies, with no dependency on a diff library.
//
// The shape is a classic LCS, but the full O(n·m) table is only ever built for
// the part that actually differs: identical prefixes and suffixes are trimmed
// first, which is the common case when comparing two responses from the same
// endpoint. Beyond a size cap the table would cost more memory than the answer
// is worth, so the comparison degrades to a positional one and says so.

export type DiffLineKind = 'equal' | 'added' | 'removed';

export type DiffLine = {
  kind: DiffLineKind;
  text: string;
  /** 1-based line number in the previous response, or null for added lines. */
  beforeLine: number | null;
  /** 1-based line number in the current response, or null for removed lines. */
  afterLine: number | null;
};

export type ResponseDiff = {
  lines: DiffLine[];
  added: number;
  removed: number;
  identical: boolean;
  /** True when the bodies were too large for a real LCS and were compared line by line. */
  approximate: boolean;
};

// 4M cells of Uint32Array ≈ 16 MB, which is the most worth spending inside a
// UI thread. Larger bodies fall back to a positional comparison.
const MAX_LCS_CELLS = 4_000_000;

function splitLines(value: string): string[] {
  if (!value) return [];
  return value.replace(/\r\n?/g, '\n').split('\n');
}

function lcsLines(before: string[], after: string[]): DiffLine[] {
  const rows = before.length;
  const columns = after.length;
  // table[i][j] = LCS length of before[i…] and after[j…], stored flat.
  const width = columns + 1;
  const table = new Uint32Array((rows + 1) * width);
  for (let i = rows - 1; i >= 0; i -= 1) {
    for (let j = columns - 1; j >= 0; j -= 1) {
      table[i * width + j] = before[i] === after[j]
        ? table[(i + 1) * width + j + 1] + 1
        : Math.max(table[(i + 1) * width + j], table[i * width + j + 1]);
    }
  }

  const lines: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < rows && j < columns) {
    if (before[i] === after[j]) {
      lines.push({ kind: 'equal', text: before[i], beforeLine: i + 1, afterLine: j + 1 });
      i += 1;
      j += 1;
    } else if (table[(i + 1) * width + j] >= table[i * width + j + 1]) {
      lines.push({ kind: 'removed', text: before[i], beforeLine: i + 1, afterLine: null });
      i += 1;
    } else {
      lines.push({ kind: 'added', text: after[j], beforeLine: null, afterLine: j + 1 });
      j += 1;
    }
  }
  while (i < rows) {
    lines.push({ kind: 'removed', text: before[i], beforeLine: i + 1, afterLine: null });
    i += 1;
  }
  while (j < columns) {
    lines.push({ kind: 'added', text: after[j], beforeLine: null, afterLine: j + 1 });
    j += 1;
  }
  return lines;
}

function positionalDiff(before: string[], after: string[]): DiffLine[] {
  const lines: DiffLine[] = [];
  const length = Math.max(before.length, after.length);
  for (let index = 0; index < length; index += 1) {
    const beforeLine = before[index];
    const afterLine = after[index];
    if (beforeLine !== undefined && afterLine !== undefined && beforeLine === afterLine) {
      lines.push({ kind: 'equal', text: beforeLine, beforeLine: index + 1, afterLine: index + 1 });
      continue;
    }
    if (beforeLine !== undefined) {
      lines.push({ kind: 'removed', text: beforeLine, beforeLine: index + 1, afterLine: null });
    }
    if (afterLine !== undefined) {
      lines.push({ kind: 'added', text: afterLine, beforeLine: null, afterLine: index + 1 });
    }
  }
  return lines;
}

export function diffResponseBodies(previous: string, current: string): ResponseDiff {
  const before = splitLines(previous);
  const after = splitLines(current);

  // Shared head and tail never need the table, and trimming them is what keeps
  // "one field changed in a large payload" cheap.
  let head = 0;
  while (head < before.length && head < after.length && before[head] === after[head]) head += 1;
  let tail = 0;
  while (
    tail < before.length - head
    && tail < after.length - head
    && before[before.length - 1 - tail] === after[after.length - 1 - tail]
  ) tail += 1;

  const beforeMiddle = before.slice(head, before.length - tail);
  const afterMiddle = after.slice(head, after.length - tail);

  const approximate = (beforeMiddle.length + 1) * (afterMiddle.length + 1) > MAX_LCS_CELLS;
  const middle = approximate ? positionalDiff(beforeMiddle, afterMiddle) : lcsLines(beforeMiddle, afterMiddle);

  const lines: DiffLine[] = [];
  for (let index = 0; index < head; index += 1) {
    lines.push({ kind: 'equal', text: before[index], beforeLine: index + 1, afterLine: index + 1 });
  }
  for (const line of middle) {
    lines.push({
      ...line,
      beforeLine: line.beforeLine === null ? null : line.beforeLine + head,
      afterLine: line.afterLine === null ? null : line.afterLine + head,
    });
  }
  for (let index = 0; index < tail; index += 1) {
    const beforeIndex = before.length - tail + index;
    const afterIndex = after.length - tail + index;
    lines.push({ kind: 'equal', text: before[beforeIndex], beforeLine: beforeIndex + 1, afterLine: afterIndex + 1 });
  }

  const added = lines.filter(line => line.kind === 'added').length;
  const removed = lines.filter(line => line.kind === 'removed').length;
  return { lines, added, removed, identical: added === 0 && removed === 0, approximate };
}

/**
 * Drops runs of unchanged lines longer than `context * 2`, keeping `context`
 * lines on each side of a change. Returns the kept lines with gap markers so
 * the viewer can show "… 42 unchanged lines".
 */
export type DiffChunk = { kind: 'lines'; lines: DiffLine[] } | { kind: 'gap'; count: number };

export function collapseUnchanged(lines: DiffLine[], context = 3): DiffChunk[] {
  const keep = new Array<boolean>(lines.length).fill(false);
  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index].kind === 'equal') continue;
    for (let offset = Math.max(0, index - context); offset <= Math.min(lines.length - 1, index + context); offset += 1) {
      keep[offset] = true;
    }
  }

  const chunks: DiffChunk[] = [];
  let index = 0;
  while (index < lines.length) {
    if (keep[index]) {
      const run: DiffLine[] = [];
      while (index < lines.length && keep[index]) {
        run.push(lines[index]);
        index += 1;
      }
      chunks.push({ kind: 'lines', lines: run });
      continue;
    }
    let count = 0;
    while (index < lines.length && !keep[index]) {
      count += 1;
      index += 1;
    }
    chunks.push({ kind: 'gap', count });
  }
  return chunks;
}
