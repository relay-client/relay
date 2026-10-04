import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { identity, transform } from './rename-project.mjs';

const config = identity('callwing');

test('derive identity and reject unsafe or identifier-breaking names', () => {
  assert.deepEqual(config, { name: 'callwing', display: 'Callwing', org: 'callwing', domain: 'callwing.dev' });
  for (const name of [undefined, '../foo', 'foo-bar', 'two words', '123', 'Relay', 'relaynext', 'x']) {
    assert.throws(() => identity(name));
  }
  assert.throws(() => identity('callwing', { domain: 'https://callwing.dev' }));
  assert.throws(() => identity('callwing', { display: 'Call Wing' }));
});

test('consistent replacements cover module, identities, protocols and identifiers', () => {
  const source = 'github.com/relay-client/relay com.relayclient.relay Relay Client relayclient.dev relay.dev cookie-sync@relay-client.dev RELAY_EXTENSION_KEY relayGitignoreEntries isRelayFile X-Relay-Key @relay/web';
  const custom = identity('callwing', { display: 'CallWing', org: 'callwing-team', domain: 'callwing.app' });
  assert.equal(transform(source, 'example.go', custom), 'github.com/callwing-team/callwing dev.callwing.app CallWing callwing.app callwing.app cookie-sync@callwing.app CALLWING_EXTENSION_KEY callwingGitignoreEntries isCallWingFile X-CallWing-Key @callwing/web');
});

test('keep historical releases, original plan, and incoming redirect prefix', () => {
  const history = '## [2.0.0]\nRelay relay run relay-client/relay\n';
  const output = transform(`# Relay\n## [Unreleased]\n\n${history}`, 'CHANGELOG.md', config);
  assert.ok(output.startsWith('# Callwing'));
  assert.ok(output.includes('Relay is now Callwing'));
  assert.ok(output.endsWith(history));
  assert.equal(transform('Relay → <name>', 'docs/RENAME_PLAN.md', config), 'Relay → <name>');
  assert.equal(transform("const oldBase = '/relay';\nRelay moved to relayclient.dev", 'scripts/build-pages-redirect.mjs', config), "const oldBase = '/relay';\nCallwing moved to callwing.dev");
});

test('recompute the Base64 fixture when its plaintext changes', () => {
  const source = 'pm.crypto.base64Encode("relay")).to.equal("cmVsYXk=")';
  assert.equal(transform(source, 'apps/desktop/internal/script/engine_scopes_test.go', config), 'pm.crypto.base64Encode("callwing")).to.equal("Y2FsbHdpbmc=")');
});

test('preview is read-only; apply protects dirty tree, keys, history and binary bytes', () => {
  const dir = mkdtempSync(join(tmpdir(), 'project-rename-test-'));
  const put = (path, data) => { mkdirSync(dirname(join(dir, path)), { recursive: true }); writeFileSync(join(dir, path), data); };
  const git = (...args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' });
  put('scripts/rename-project.mjs', readFileSync(fileURLToPath(new URL('./rename-project.mjs', import.meta.url))));
  put('apps/desktop/go.mod', 'module github.com/relay-client/relay/apps/desktop\n');
  put('schemas/relay-workspace-yaml-v1.schema.json', '{"$id":"https://relay.dev/schemas/relay-workspace-yaml-v1.schema.json"}\n');
  put('src/file.js', 'const relayGitignoreEntries = "RELAY_EXTENSION_KEY Relay";\n');
  put('src/relay-mark.png', Buffer.from([0, 12, 255, 7]));
  put('extension.pem', 'Relay secret bytes');
  put('update-signing-key.pub', 'Relay signing key bytes');
  put('.gitignore', '*.pem\n');
  git('init', '-q');
  git('add', '.');
  git('-c', 'user.name=Test', '-c', 'user.email=test@example.test', 'commit', '-qm', 'fixture');
  const run = (...args) => execFileSync(process.execPath, ['scripts/rename-project.mjs', '--name', 'callwing', ...args], { cwd: dir, encoding: 'utf8', stdio: 'pipe' });
  assert.match(run(), /Preview:/);
  assert.equal(git('status', '--porcelain'), '');
  put('untracked.txt', 'Relay');
  assert.throws(() => run('--apply'), /Commit or stash/);
  // Commit the extra file so apply can proceed without discarding anything.
  git('add', '.');
  git('-c', 'user.name=Test', '-c', 'user.email=test@example.test', 'commit', '-qm', 'extra fixture');
  assert.match(run('--apply'), /Applied:/);
  assert.match(readFileSync(join(dir, 'apps/desktop/go.mod'), 'utf8'), /callwing\/callwing/);
  assert.match(readFileSync(join(dir, 'src/file.js'), 'utf8'), /callwingGitignoreEntries.*CALLWING_EXTENSION_KEY Callwing/);
  assert.deepEqual(readFileSync(join(dir, 'src/callwing-mark.png')), Buffer.from([0, 12, 255, 7]));
  assert.equal(readFileSync(join(dir, 'extension.pem'), 'utf8'), 'Relay secret bytes');
  assert.equal(readFileSync(join(dir, 'update-signing-key.pub'), 'utf8'), 'Relay signing key bytes');
  assert.equal(readFileSync(join(dir, 'apps/web/public/schemas/callwing-workspace-yaml-v1.schema.json'), 'utf8'), readFileSync(join(dir, 'schemas/callwing-workspace-yaml-v1.schema.json'), 'utf8'));
  assert.throws(() => run('--apply'), /already renamed/);
});
