#!/usr/bin/env node
import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

import { PRIMARY_DOMAIN } from '../apps/web/site.constants.mjs';

const root = resolve(dirname(new URL(import.meta.url).pathname), '..');
const source = join(root, 'apps/web/dist');
const output = join(root, 'apps/web/redirect-dist');
const target = `https://${PRIMARY_DOMAIN}`;
const oldBase = '/relay';

function pagePaths(dir) {
  const found = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...pagePaths(path));
    else if (entry.name === 'index.html') {
      const rel = relative(source, dirname(path));
      found.push(rel ? `${rel.split('\\').join('/')}/` : '');
    }
  }
  return found;
}

function escape(value) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function shim(path) {
  const url = escape(`${target}/${path}`);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Kurlo moved to ${PRIMARY_DOMAIN}</title>
<link rel="canonical" href="${url}">
<meta http-equiv="refresh" content="0; url=${url}">
<style>body{font:16px/1.6 system-ui,sans-serif;margin:4rem auto;max-width:34rem;padding:0 1.5rem}</style>
</head>
<body>
<h1>Kurlo has a new home</h1>
<p>This page now lives at <a href="${url}">${url}</a>.</p>
</body>
</html>
`;
}

const notFound = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Kurlo moved to ${PRIMARY_DOMAIN}</title>
<style>body{font:16px/1.6 system-ui,sans-serif;margin:4rem auto;max-width:34rem;padding:0 1.5rem}</style>
</head>
<body>
<h1>Kurlo has a new home</h1>
<p>Kurlo's site moved to <a id="target" href="${target}/">${target}</a>.</p>
<script>
(() => {
  const base = ${JSON.stringify(oldBase)};
  let path = location.pathname;
  if (path.startsWith(base)) path = path.slice(base.length);
  if (!path.startsWith('/')) path = '/' + path;
  const url = ${JSON.stringify(target)} + path + location.search + location.hash;
  const link = document.getElementById('target');
  if (link) {
    link.href = url;
    link.textContent = url;
  }
  location.replace(url);
})();
</script>
</body>
</html>
`;

rmSync(output, { recursive: true, force: true });
mkdirSync(output, { recursive: true });

const paths = pagePaths(source);
if (!paths.length) {
  console.error(`no pages found in ${relative(root, source)}; build the site first`);
  process.exit(1);
}

for (const path of paths) {
  const file = join(output, path, 'index.html');
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, shim(path));
}

writeFileSync(join(output, '404.html'), notFound);

console.log(`wrote ${paths.length} redirect pages plus 404.html to ${relative(root, output)} -> ${target}`);
