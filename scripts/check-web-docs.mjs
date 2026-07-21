#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, normalize, relative, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

const root = resolve(dirname(new URL(import.meta.url).pathname), '..');
const webRoot = join(root, 'apps/web');
const contentRoot = join(webRoot, 'src/content/docs');
const screenshotsRoot = join(webRoot, 'src/assets/screenshots');
const distRoot = join(webRoot, 'dist');

const errors = [];
const warnings = [];

function fail(message) {
  errors.push(message);
}

function warn(message) {
  warnings.push(message);
}

function read(path) {
  return readFileSync(path, 'utf8');
}

function walk(dir, predicate = () => true) {
  const output = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) output.push(...walk(path, predicate));
    else if (predicate(path)) output.push(path);
  }
  return output;
}

function stripQueryAndHash(input) {
  return input.split('#')[0].split('?')[0];
}

function distCandidates(urlPath) {
  const clean = stripQueryAndHash(decodeURIComponent(urlPath));
  if (clean === '/') return [join(distRoot, 'index.html')];
  const trimmed = clean.replace(/^\/+/, '').replace(/\/+$/, '');
  return [
    join(distRoot, trimmed, 'index.html'),
    join(distRoot, `${trimmed}.html`),
    join(distRoot, trimmed),
  ];
}

function distPathExists(urlPath) {
  return distCandidates(urlPath).some(path => existsSync(path));
}

function checkMarkdownAssets(files) {
  const imageLinkRe = /!\[[^\]]*]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
  for (const file of files) {
    const text = read(file);
    for (const match of text.matchAll(imageLinkRe)) {
      const raw = stripQueryAndHash(match[1]);
      if (/^(https?:|data:)/i.test(raw)) continue;
      const target = normalize(join(dirname(file), raw));
      if (!target.startsWith(webRoot)) {
        fail(`${relative(root, file)} references image outside apps/web: ${match[1]}`);
      } else if (!existsSync(target)) {
        fail(`${relative(root, file)} references missing image: ${match[1]}`);
      }
    }
  }
}

function checkInternalLinks(files) {
  const linkPatterns = [
    /\[[^\]]+]\((\/[^)\s#?]+)(?:[?#][^)]*)?\)/g,
    /\bhref=["'](\/[^"'#?]+)(?:[?#][^"']*)?["']/g,
  ];
  for (const file of files) {
    const text = read(file);
    for (const pattern of linkPatterns) {
      for (const match of text.matchAll(pattern)) {
        const href = match[1];
        if (href.startsWith('//')) continue;
        if (!distPathExists(href)) {
          fail(`${relative(root, file)} links to missing built page: ${href}`);
        }
      }
    }
  }
}

function checkPagefind() {
  const pagefindDir = join(distRoot, 'pagefind');
  if (!existsSync(pagefindDir)) {
    fail('Pagefind output is missing: apps/web/dist/pagefind');
    return;
  }
  if (!existsSync(join(pagefindDir, 'pagefind.js'))) {
    fail('Pagefind runtime is missing: apps/web/dist/pagefind/pagefind.js');
  }
  const files = walk(pagefindDir);
  if (!files.some(path => path.endsWith('.pf_fragment'))) {
    fail('Pagefind index fragments are missing under apps/web/dist/pagefind');
  }
}

function checkCodeBackedDocs() {
  const stripGo = read(join(root, 'apps/desktop/internal/api/file_workspace_store_strip.go'));
  const secretsGo = read(join(root, 'apps/desktop/internal/api/file_workspace_store.go'));
  const schema = read(join(root, 'schemas/relay-workspace-yaml-v1.schema.json'));
  const yamlDoc = read(join(contentRoot, 'docs/reference/relay-yaml-format.md'));
  const coverage = read(join(webRoot, 'DOCS_COVERAGE.md'));

  for (const field of ['oauth2GrantType', 'oauth2AuthURL', 'oauth2RefreshToken', 'oauth2TokenExpiry', 'oauth2UsePKCE']) {
    if (!stripGo.includes(`"${field}"`)) fail(`OAuth2 field ${field} is missing from authActiveFields`);
    if (!schema.includes(`"${field}"`)) fail(`OAuth2 field ${field} is missing from YAML schema`);
    if (!yamlDoc.includes(field)) fail(`OAuth2 field ${field} is missing from YAML reference docs`);
  }
  if (!secretsGo.includes('"oauth2RefreshToken"')) {
    fail('oauth2RefreshToken is not listed as a filesystem workspace secret field');
  }
  for (const snippet of ['wsHandshakeTimeoutMs: 0', 'wsReconnectIntervalMs: 5000', 'wsMaxMessageSizeMb: 10']) {
    if (!yamlDoc.includes(snippet)) fail(`YAML request settings example is out of sync: expected "${snippet}"`);
  }

  try {
    const latestTag = execFileSync('git', ['describe', '--tags', '--abbrev=0', '--match', 'v*'], { cwd: root, encoding: 'utf8' }).trim();
    if (latestTag && !coverage.includes(`desktop tag **${latestTag}**`)) {
      fail(`DOCS_COVERAGE.md audit tag is stale: expected ${latestTag}`);
    }
  } catch {
    warn('Skipping DOCS_COVERAGE tag drift check because no git tag is available in this checkout.');
  }
}

function checkScreenshotInventory() {
  const expected = [
    'auth-oauth2-token-fetch.png',
    'cookie-jar-populated.png',
    'git-workspace.png',
    'headers-tab.png',
    'import-postman.png',
    'request-editor.png',
    'request-grpc.png',
    'request-graphql.png',
    'request-settings.png',
    'request-socketio.png',
    'request-sse.png',
    'request-websocket.png',
    'response-viewer-search.png',
    'response-viewer-large-body.png',
    'scripting-tengo.png',
  ];
  for (const name of expected) {
    const path = join(screenshotsRoot, name);
    if (!existsSync(path)) fail(`Expected docs screenshot is missing: ${relative(root, path)}`);
    else if (statSync(path).size < 1024) fail(`Docs screenshot looks too small: ${relative(root, path)}`);
  }
}

if (!existsSync(distRoot)) {
  fail('Build output is missing. Run npm run web:build before npm run web:check-docs.');
} else {
  const contentFiles = walk(contentRoot, path => /\.(mdx?|astro)$/i.test(path));
  checkMarkdownAssets(contentFiles);
  checkInternalLinks(contentFiles);
  checkPagefind();
  checkCodeBackedDocs();
  checkScreenshotInventory();
}

for (const message of warnings) console.warn(`docs-check warning: ${message}`);
if (errors.length) {
  console.error('docs-check failed:');
  for (const message of errors) console.error(`- ${message}`);
  process.exit(1);
}

console.log('docs-check passed.');
