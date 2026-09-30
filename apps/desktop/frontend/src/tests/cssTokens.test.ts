import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const srcRoot = fileURLToPath(new URL('..', import.meta.url));

function collectFiles(dir: string, extensions: string[]): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      out.push(...collectFiles(path, extensions));
      continue;
    }
    if (extensions.some(extension => entry.endsWith(extension))) out.push(path);
  }
  return out;
}

const DEFINITION = /(--[A-Za-z0-9_-]+)\s*:/g;
const USAGE = /var\(\s*(--[A-Za-z0-9_-]+)\s*(,|\))/g;

const EXTERNAL = new Set<string>();

function scan() {
  const files = collectFiles(srcRoot, ['.css', '.svelte']);
  const defined = new Set(EXTERNAL);
  const used: Array<{ name: string; file: string; line: number }> = [];

  for (const file of files) {
    const text = readFileSync(file, 'utf8');
    for (const match of text.matchAll(DEFINITION)) defined.add(match[1]);
    text.split('\n').forEach((line, index) => {
      for (const match of line.matchAll(USAGE)) {
        if (match[2] === ',') continue;
        used.push({ name: match[1], file: relative(srcRoot, file), line: index + 1 });
      }
    });
  }
  return { defined, used, fileCount: files.length };
}

describe('CSS custom properties', () => {
  it('every var() without a fallback names a property that exists', () => {
    const { defined, used, fileCount } = scan();
    expect(fileCount).toBeGreaterThan(20);

    const undefinedUses = used.filter(entry => !defined.has(entry.name));
    const report = undefinedUses.map(entry => `${entry.file}:${entry.line} uses ${entry.name}`);
    expect(report).toEqual([]);
  });

  it('the tokens both themes rely on are defined', () => {
    const { defined } = scan();
    for (const token of [
      '--bg', '--surface', '--elevated', '--hover', '--border', '--border-subtle',
      '--text', '--text-2', '--text-3',
      '--accent', '--accent-dim', '--accent-hover',
      '--s2xx', '--s3xx', '--s4xx', '--s5xx',
      '--font-mono', '--font-ui',
    ]) {
      expect(defined).toContain(token);
    }
  });

  it('the light theme redefines every literal colour the dark theme sets', () => {
    const tokens = readFileSync(join(srcRoot, 'styles/tokens.css'), 'utf8');
    const lightStart = tokens.indexOf(':root[data-theme="light"]');
    expect(lightStart).toBeGreaterThan(0);

    const declarations = (block: string) => {
      const out = new Map<string, string>();
      for (const line of block.split('\n')) {
        const match = /^\s*(--[A-Za-z0-9_-]+)\s*:\s*([^;]+);/.exec(line);
        if (match) out.set(match[1], match[2].trim());
      }
      return out;
    };
    const dark = declarations(tokens.slice(0, lightStart));
    const light = declarations(tokens.slice(lightStart));

    const shared = new Set([
      '--font-mono', '--font-ui',
      '--diagnostic-error',
    ]);

    const missing = [...dark]
      .filter(([name, value]) => !light.has(name) && !shared.has(name) && !value.includes('var('))
      .map(([name]) => name);
    expect(missing).toEqual([]);
  });
});
