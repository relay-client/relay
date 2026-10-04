#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const tooling = new Set(['scripts/rename-project.mjs', 'scripts/rename-project.test.mjs', 'docs/RENAMING.md', 'docs/RENAME_PLAN.md']);
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' });

export function identity(name, overrides = {}) {
  // A single identifier works in Go/JS identifiers, npm scopes, binaries and DNS.
  if (!/^[a-z][a-z0-9]{1,29}$/.test(name) || /relay/i.test(name)) {
    throw new Error('Name must be 2–30 lowercase ASCII letters/digits, start with a letter and contain no old brand.');
  }
  const config = {
    name,
    display: name[0].toUpperCase() + name.slice(1),
    org: name,
    domain: `${name}.dev`,
    ...overrides,
  };
  if (!/^[A-Z][A-Za-z0-9]{1,29}$/.test(config.display) || /relay/i.test(config.display)) {
    throw new Error('Display name must be one ASCII identifier starting with an uppercase letter.');
  }
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(config.org) || config.org.length > 39 || /relay/i.test(config.org)) {
    throw new Error('Invalid GitHub organization.');
  }
  if (config.domain.length > 253 || !config.domain.includes('.') || /relay/i.test(config.domain)
      || !config.domain.split('.').every(label => label.length <= 63 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(label))) {
    throw new Error('Domain must be a lowercase hostname without a scheme or path.');
  }
  return config;
}

export function transform(source, path, config) {
  if (tooling.has(path)) return source;
  const { name, display, org, domain } = config;
  let head = source;
  let tail = '';
  // Historical releases keep their original commands, URLs and artifact names.
  const history = path === 'CHANGELOG.md' ? /^## \[(?!Unreleased\])/m
    : path === 'apps/web/src/content/docs/changelog.md' ? /^## \d/m : null;
  const boundary = history ? source.search(history) : -1;
  if (boundary >= 0) {
    head = source.slice(0, boundary);
    tail = source.slice(boundary);
  }
  // The old GitHub Pages prefix must still strip /relay from incoming URLs.
  const oldPrefix = "const oldBase = '/relay';";
  if (path === 'scripts/build-pages-redirect.mjs') head = head.replace(oldPrefix, '/* OLD_PAGES_PREFIX */');
  // Longest identities first; then protocol tokens, then matching code identifiers.
  head = head.replace(/com\.relayclient\.relay/g, `dev.${name}.app`)
    .replace(/relayclient\.dev|relay-client\.dev|relay\.dev/g, domain)
    .replace(/relay-client/g, org)
    .replace(/Relay Client/g, display)
    .replace(/RELAY/g, name.toUpperCase())
    .replace(/Relay/g, display)
    .replace(/relay/g, name);
  if (path === 'apps/desktop/internal/script/engine_scopes_test.go') {
    head = head.replace(/cmVsYXk=/g, Buffer.from(name).toString('base64'));
  }
  if (path === 'scripts/build-pages-redirect.mjs') head = head.replace('/* OLD_PAGES_PREFIX */', oldPrefix);
  if (boundary >= 0) {
    const note = `### Changed\n\n- Relay is now ${display}. CLI, workspace paths and application identity use the new name.\n\n`;
    head += path === 'CHANGELOG.md' ? note : `## Unreleased\n\n${note}`;
  }
  return head + tail;
}

function category(path) {
  if (path.startsWith('.github/') || path.includes('/build/') || /Makefile|go\.(mod|work)|package.*json|wails\.json/.test(path)) return 'identity/build';
  if (path.startsWith('apps/extension/')) return 'extension';
  if (path.startsWith('apps/web/') || path.endsWith('.md')) return 'site/docs';
  return 'runtime/contracts';
}

function parse(args) {
  const options = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--apply' || arg === '--verify' || arg === '--help') options[arg.slice(2)] = true;
    else if (['--name', '--display', '--org', '--domain', '--report'].includes(arg)) {
      if (!args[i + 1] || args[i + 1].startsWith('--')) throw new Error(`Missing value for ${arg}`);
      options[arg.slice(2)] = args[++i];
    } else throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

function main() {
  const options = parse(process.argv.slice(2));
  if (options.help) {
    console.log('Preview: node scripts/rename-project.mjs --name callwing\nApply:   node scripts/rename-project.mjs --name callwing --apply --verify\nOptional: --display CallWing --org callwing-team --domain callwing.dev --report /tmp/rename.json');
    return;
  }
  const overrides = Object.fromEntries(['display', 'org', 'domain'].filter(key => options[key]).map(key => [key, options[key]]));
  const config = identity(options.name, overrides);
  if (options.verify && !options.apply) throw new Error('--verify requires --apply; preview never runs builds or tests.');
  if (!git('ls-files', 'apps/desktop/go.mod').trim() || !readFileSync(join(root, 'apps/desktop/go.mod'), 'utf8').includes('github.com/relay-client/relay/apps/desktop')) {
    throw new Error('This tool expects the original Relay module; it cannot rebrand an already renamed checkout.');
  }
  if (options.apply && git('status', '--porcelain', '--untracked-files=all').trim()) {
    throw new Error('Commit or stash all changes before --apply. Preview works in a dirty checkout.');
  }
  // Include non-ignored, untracked source in previews, never .env, private keys or build output.
  const files = [...new Set(git('ls-files', '-z', '--cached', '--others', '--exclude-standard').split('\0').filter(Boolean))];
  const changes = [];
  const binaryAssets = [];
  for (const path of files) {
    if (tooling.has(path) || !existsSync(join(root, path))) continue;
    if (/(^|\/)(\.env(?:\..*)?|update-signing-key(?:\.pub)?)$|\.(pem|pfx|p12|crx|key)$/.test(path)) continue;
    if (!lstatSync(join(root, path)).isFile()) continue;
    const bytes = readFileSync(join(root, path));
    const target = path.replace(/relay/g, config.name).replace(/Relay/g, config.display).replace(/RELAY/g, config.name.toUpperCase());
    const binary = bytes.includes(0) || !Buffer.from(bytes.toString('utf8')).equals(bytes);
    if (binary) {
      if (/\.(png|icns|ico|bmp|jpg|jpeg|webp)$/i.test(path)) binaryAssets.push(path);
      if (target !== path) changes.push({ path, target, category: category(path), binary: true });
      continue;
    }
    const source = bytes.toString('utf8');
    const content = transform(source, path, config);
    if (source !== content || target !== path) changes.push({ path, target, category: category(path), content });
  }
  const schema = changes.find(change => change.path === 'schemas/relay-workspace-yaml-v1.schema.json');
  if (!schema) throw new Error('Workspace schema is missing from rename plan.');
  const publicSchema = `apps/web/public/schemas/${config.name}-workspace-yaml-v1.schema.json`;
  const destinations = new Set();
  for (const { path, target } of [...changes, { path: null, target: publicSchema }]) {
    if (destinations.has(target) || (path !== target && existsSync(join(root, target)))) throw new Error(`Rename collision: ${target}`);
    destinations.add(target);
  }
  const commands = [
    'npm install --package-lock-only --ignore-scripts',
    'npm run frontend:build', 'make check', 'go test -race ./apps/desktop/...',
    'npm run frontend:e2e', 'npm run frontend:e2e:webkit',
    'npm run web:build', 'npm run web:check-docs',
    'node scripts/gen-appicon.mjs', 'node scripts/gen-installer-assets.mjs',
    'make screenshots', 'make readme-screenshot', 'node scripts/gen-landing-images.mjs',
  ];
  const report = {
    identity: config,
    mode: options.apply ? 'apply' : 'preview',
    changes: changes.map(({ content, ...change }) => ({ ...change, textChanged: content !== undefined })),
    publicSchema,
    binaryAssets,
    commands,
    intentionalOldNames: ['historical changelog entries', 'old GitHub Pages /relay prefix', 'rename tooling and original plan'],
    manual: [
      `Reserve ${config.domain}, GitHub ${config.org}, social handles; choose the new logo.`,
      `Move GitHub repository to ${config.org}/${config.name}; preserve signing/extension keys and verify secrets, rulesets and environments.`,
      `Rename RELAY_* Actions variables/secrets to ${config.name.toUpperCase()}_* (including extension key); preserve their values.`,
      `Provision /srv/${config.domain}, HTTPS and DNS; redirect relayclient.dev preserving paths.`,
      `Set git remote to https://github.com/${config.org}/${config.name}.git after GitHub migration.`,
      `MSIX: supply a certificate whose subject matches CN=${config.display}, or override the Publisher to match your existing certificate.`,
      `Replace artwork and regenerate installers/screenshots; review every diff and run the checks above.`,
      `Update search consoles, store listings, MCP configs and local data/keychain; smoke-test desktop, CLI, MCP and cookie sync.`,
      `Publish the major release only after infrastructure and checks are ready.`,
    ],
  };
  if (options.report) {
    const reportPath = resolve(root, options.report);
    if (existsSync(reportPath) || files.includes(options.report) || destinations.has(options.report)) throw new Error('Report must use a new file path.');
    if (options.apply && reportPath.startsWith(`${root}/`)) throw new Error('For --apply, place the report outside the checkout.');
    writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
  }
  if (options.apply) {
    // All paths/collisions are checked before mutation. Git remains the rollback source.
    for (const { path, target, content } of changes) {
      if (content !== undefined) writeFileSync(join(root, path), content);
      if (target !== path) {
        mkdirSync(dirname(join(root, target)), { recursive: true });
        renameSync(join(root, path), join(root, target));
      }
    }
    mkdirSync(dirname(join(root, publicSchema)), { recursive: true });
    writeFileSync(join(root, publicSchema), schema.content);
  }
  console.log(`${options.apply ? 'Applied' : 'Preview'}: ${config.display} / ${config.org}/${config.name} / ${config.domain}`);
  for (const group of ['identity/build', 'runtime/contracts', 'extension', 'site/docs']) {
    console.log(`${group}: ${changes.filter(change => change.category === group).length} files`);
  }
  for (const change of changes.filter(change => change.path !== change.target)) console.log(`Move: ${change.path} -> ${change.target}`);
  console.log(`Publish schema: ${publicSchema}`);
  console.log('\nFollow-up commands (after reviewing the diff and choosing artwork):\n' + commands.join('\n'));
  console.log('\nExternal/manual steps:\n' + report.manual.map(step => `- ${step}`).join('\n'));
  if (options.verify) {
    const checks = [
      ['npm', ['run', 'frontend:build']],
      ['make', ['check']],
      ['go', ['test', '-race', './apps/desktop/...']],
      ['npm', ['run', 'frontend:e2e']],
      ['npm', ['run', 'frontend:e2e:webkit']],
      ['npm', ['run', 'web:build']],
      ['npm', ['run', 'web:check-docs']],
    ];
    for (const [command, args] of checks) {
      console.log(`\nChecking: ${command} ${args.join(' ')}`);
      try {
        execFileSync(command, args, { cwd: root, stdio: 'inherit', env: { ...process.env, GOCACHE: join(root, '.cache/go-build') } });
      } catch {
        throw new Error(`Verification failed: ${command} ${args.join(' ')}. Rename changes remain in the checkout for review and repair.`);
      }
    }
  }
  if (!options.apply) console.log('\nNo project files changed. Add --apply when the name is final and the checkout is clean.');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
