import { chromium } from '@playwright/test';
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const port = Number(process.env.RELAY_BRIDGE_PORT);
const source = process.env.RELAY_EXTENSION_DIR;
const domain = process.env.RELAY_COOKIE_DOMAIN ?? 'relay.test';

if (!port || !source) {
  console.error('RELAY_BRIDGE_PORT and RELAY_EXTENSION_DIR are required');
  process.exit(2);
}

function say(event, detail = {}) {
  console.log(JSON.stringify({ event, ...detail }));
}

function deadline(ms) {
  const until = Date.now() + ms;
  return () => Date.now() > until;
}

async function until(check, ms, what) {
  const expired = deadline(ms);
  for (;;) {
    const value = await check();
    if (value) return value;
    if (expired()) throw new Error(`timed out waiting for ${what}`);
    await new Promise(resolve => setTimeout(resolve, 200));
  }
}

const extensionDir = mkdtempSync(join(tmpdir(), 'relay-extension-'));
cpSync(source, extensionDir, { recursive: true });
const manifest = JSON.parse(readFileSync(join(extensionDir, 'manifest.json'), 'utf8'));
manifest.host_permissions = [...manifest.host_permissions, `*://*.${domain}/*`];
delete manifest.optional_host_permissions;
writeFileSync(join(extensionDir, 'manifest.json'), JSON.stringify(manifest, null, 2));

const profile = mkdtempSync(join(tmpdir(), 'relay-profile-'));
const context = await chromium.launchPersistentContext(profile, {
  channel: 'chromium',
  args: [`--disable-extensions-except=${extensionDir}`, `--load-extension=${extensionDir}`],
});

try {
  const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker', { timeout: 20000 }));
  say('loaded', { extension: worker.url().split('/')[2] });

  const storage = () => worker.evaluate(() => chrome.storage.local.get(['token', 'pending', 'lastError', 'domains']));

  await worker.evaluate(async (bridgePort) => {
    await chrome.storage.local.set({ port: bridgePort });
    await connect();
  }, port);

  const firstToken = await until(async () => (await storage()).token, 30000, 'Relay to approve the first pairing');
  say('paired', { token: `${firstToken.slice(0, 6)}…` });

  await context.addCookies([{
    name: 'sid',
    value: 'from-browser',
    domain: `.${domain}`,
    path: '/',
    httpOnly: true,
    secure: true,
    sameSite: 'Lax',
    expires: Math.floor(Date.now() / 1000) + 3600,
  }]);
  say('cookie-added');

  await new Promise(resolve => setTimeout(resolve, 2000));
  await context.clearCookies({ name: 'sid' });
  say('cookie-cleared');

  const repaired = await until(async () => {
    const state = await storage();
    return state.token && state.token !== firstToken ? state.token : '';
  }, 45000, 'the extension to pair again after Relay disconnected it');
  say('repaired', { token: `${repaired.slice(0, 6)}…` });

  await context.addCookies([{
    name: 'sid2',
    value: 'after-repair',
    domain: `.${domain}`,
    path: '/',
    expires: Math.floor(Date.now() / 1000) + 3600,
  }]);
  say('cookie-added-again');

  await new Promise(resolve => setTimeout(resolve, 2000));
  say('done', { lastError: (await storage()).lastError });
} catch (error) {
  say('failed', { error: error instanceof Error ? error.message : String(error) });
  await context.close();
  process.exit(1);
}

await context.close();
