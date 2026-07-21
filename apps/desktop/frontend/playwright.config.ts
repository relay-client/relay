import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defineConfig, devices, type PlaywrightTestConfig } from '@playwright/test';

const slowMoMs = Number.parseInt(process.env.RELAY_E2E_SLOWMO_MS ?? '0', 10);
const slowMo = Number.isFinite(slowMoMs) && slowMoMs > 0 ? slowMoMs : 0;
const artifactDir = process.env.RELAY_E2E_ARTIFACT_DIR ?? join(tmpdir(), 'relay-playwright-artifacts');
const reporter: PlaywrightTestConfig['reporter'] = process.env.CI || process.env.RELAY_E2E_HTML_REPORT === '1'
  ? [
      ['list'],
      ['./e2e/cleanup-reporter.ts', { artifactDir }],
      ['html', { open: 'never', outputFolder: process.env.RELAY_E2E_REPORT_DIR ?? join(artifactDir, 'html-report') }],
    ]
  : [
      ['list'],
      ['./e2e/cleanup-reporter.ts', { artifactDir }],
    ];

export default defineConfig({
  testDir: './e2e',
  // Keep test results in a subfolder so the html-report sibling doesn't live
  // inside outputDir — Playwright warns the html reporter clears its folder.
  outputDir: join(artifactDir, 'test-results'),
  preserveOutput: 'failures-only',
  timeout: slowMo ? 180_000 : 90_000,
  expect: {
    timeout: 10_000,
  },
  fullyParallel: false,
  // Retry in CI to absorb the occasional cold-start/timing flake; locally a
  // failure is always a real failure worth seeing immediately.
  retries: process.env.CI ? 2 : 0,
  reporter,
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    launchOptions: {
      slowMo,
    },
  },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 4173 --strictPort',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
