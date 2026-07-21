import { describe, expect, it } from 'vitest';
import {
  buildResponseMatchOffsets,
  countMatches,
  countMatchesAsync,
  renderResponseBodyLines,
  responseMatchLine,
  shouldVirtualizeResponseBody,
} from '../lib/response-render';
import { prettyMarkup } from '../lib/utils';

describe('HTML formatting', () => {
  it('formats nested markup and keeps void tags inline', () => {
    expect(prettyMarkup('<main><section><h1>Hello</h1><img src="x"></section></main>')).toBe([
      '<main>',
      '  <section>',
      '    <h1>Hello</h1>',
      '    <img src="x">',
      '  </section>',
      '</main>',
    ].join('\n'));
  });

  it('highlights HTML response lines', () => {
    const [line] = renderResponseBodyLines('<main class="hero">Hi</main>', 'html', '', 0);
    const html = line?.html ?? '';

    expect(html).toContain('class="ht"');
    expect(html).toContain('class="hn"');
    expect(html).toContain('class="ha"');
    expect(html).toContain('class="js"');
  });

  it('counts search matches across chunk boundaries', () => {
    expect(countMatches('xxabcxxABCxxab', 'abc', { chunkSize: 4 })).toBe(2);
    expect(countMatches('ababa', 'aba', { chunkSize: 2 })).toBe(1);
  });

  it('counts search matches asynchronously in chunks', async () => {
    await expect(countMatchesAsync('xxabcxxABCxxab', 'abc', { chunkSize: 4 })).resolves.toBe(2);
  });

  it('maps a response search result to its source line', () => {
    const lines = ['zero hit', 'hit and hit', 'none', 'last hit'];
    const offsets = buildResponseMatchOffsets(lines, 'hit');

    expect(offsets).toEqual([0, 1, 3, 3, 4]);
    expect(responseMatchLine(offsets, 0)).toBe(0);
    expect(responseMatchLine(offsets, 2)).toBe(1);
    expect(responseMatchLine(offsets, 3)).toBe(3);
    expect(responseMatchLine(offsets, 4)).toBe(-1);
  });

  it('marks the line containing the current search result', () => {
    const lines = renderResponseBodyLines('first\nsecond hit\nthird hit', 'text', 'hit', 1);
    expect(lines.map(line => Boolean(line.hasCurrentMatch))).toEqual([false, false, true]);
  });

  it('virtualizes based on render cost instead of a response byte threshold', () => {
    expect(shouldVirtualizeResponseBody('{\n  "ok": true\n}', 'json')).toBe(false);
    expect(shouldVirtualizeResponseBody(Array.from({ length: 900 }, (_, i) => `line ${i}`).join('\n'), 'text')).toBe(true);
    expect(shouldVirtualizeResponseBody('x'.repeat(5_000), 'text')).toBe(true);

    const tokenDenseJson = JSON.stringify(Object.fromEntries(
      Array.from({ length: 900 }, (_, i) => [`key-${i}`, i]),
    ));
    expect(tokenDenseJson.length).toBeLessThan(100_000);
    expect(shouldVirtualizeResponseBody(tokenDenseJson, 'json')).toBe(true);
  });
});
