#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const platforms = {
  'darwin arm64': '@kurlo/darwin-arm64',
  'darwin x64': '@kurlo/darwin-x64',
  'linux arm64': '@kurlo/linux-arm64',
  'linux x64': '@kurlo/linux-x64',
  'win32 arm64': '@kurlo/win32-arm64',
  'win32 x64': '@kurlo/win32-x64',
};

const target = `${process.platform} ${process.arch}`;
const pkg = platforms[target];
if (!pkg) {
  console.error(`kurlo: there is no prebuilt binary for ${target}. Supported: ${Object.keys(platforms).join(', ')}.`);
  process.exit(1);
}

let binary;
try {
  binary = require.resolve(`${pkg}/bin/kurlo${process.platform === 'win32' ? '.exe' : ''}`);
} catch {
  console.error(`kurlo: ${pkg} is not installed. It is an optional dependency of @kurlo/cli, so reinstall without --no-optional or --omit=optional.`);
  process.exit(1);
}

const result = spawnSync(binary, process.argv.slice(2), { stdio: 'inherit', windowsHide: true });
if (result.error) {
  console.error(`kurlo: could not start ${binary}: ${result.error.message}`);
  process.exit(1);
}
if (result.signal) {
  process.kill(process.pid, result.signal);
}
process.exit(result.status ?? 1);
