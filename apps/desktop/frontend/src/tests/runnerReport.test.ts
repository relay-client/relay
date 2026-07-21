import { describe, expect, it } from 'vitest';
import { buildCollectionRunnerReportHtml, collectionRunnerReportFileName } from '../lib/runnerReport';
import type { CollectionRunnerResult } from '../lib/types/models';

const baseResult: CollectionRunnerResult = {
  runId: 'run-1',
  requestId: 'request-1',
  iteration: 1,
  name: 'Create User',
  method: 'POST',
  url: 'https://api.example.test/users',
  status: 'passed',
  statusCode: 201,
  duration: 42,
  testsPassed: 1,
  testsTotal: 1,
  error: '',
  tests: [{ name: 'status is 201', passed: true }],
};

describe('collection runner report', () => {
  it('builds a self-contained HTML report with summary, data rows, and tests', () => {
    const html = buildCollectionRunnerReportHtml({
      title: 'Smoke Suite',
      generatedAt: '2026-05-17T10:20:30.000Z',
      summary: {
        total: 1,
        completed: 1,
        passed: 1,
        failed: 0,
        skipped: 0,
        testsPassed: 1,
        testsTotal: 1,
        duration: 42,
        allPassed: true,
      },
      results: [baseResult],
      iterations: 1,
      delayMs: 5,
      parallel: false,
      includeTags: 'smoke',
      excludeTags: '',
      dataFileName: 'users.csv',
      dataRows: [{ name: 'Alice', token: 'abc' }],
    });

    expect(html).toContain('<!doctype html>');
    expect(html).toContain('Smoke Suite');
    expect(html).toContain('1/1');
    expect(html).toContain('users.csv (1 rows)');
    expect(html).toContain('{&quot;name&quot;:&quot;Alice&quot;,&quot;token&quot;:&quot;abc&quot;}');
    expect(html).toContain('status is 201');
  });

  it('escapes report values before writing HTML', () => {
    const html = buildCollectionRunnerReportHtml({
      title: '<script>alert(1)</script>',
      generatedAt: '2026-05-17T10:20:30.000Z',
      summary: {
        total: 1,
        completed: 1,
        passed: 0,
        failed: 1,
        skipped: 0,
        testsPassed: 0,
        testsTotal: 1,
        duration: 12,
        allPassed: false,
      },
      results: [{
        ...baseResult,
        name: '<b>bad</b>',
        status: 'failed',
        error: 'Expected <ok>',
        tests: [{ name: '<test>', passed: false, error: 'boom <x>' }],
      }],
      iterations: 1,
      delayMs: 0,
      parallel: true,
      includeTags: '',
      excludeTags: '',
    });

    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).not.toContain('<b>bad</b>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('Expected &lt;ok&gt;');
  });

  it('creates a stable html file name', () => {
    expect(collectionRunnerReportFileName('Smoke Suite', '2026-05-17T10:20:30.000Z')).toBe('smoke-suite-2026-05-17T10-20-30.html');
  });
});
