import { execFileSync } from 'node:child_process';
import { chmodSync, copyFileSync, cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const goModule = 'github.com/stormhop/kurlo/apps/desktop/internal/api';

const targets = [
  { goos: 'darwin', goarch: 'arm64', os: 'darwin', cpu: 'arm64' },
  { goos: 'darwin', goarch: 'amd64', os: 'darwin', cpu: 'x64' },
  { goos: 'linux', goarch: 'arm64', os: 'linux', cpu: 'arm64' },
  { goos: 'linux', goarch: 'amd64', os: 'linux', cpu: 'x64' },
  { goos: 'windows', goarch: 'arm64', os: 'win32', cpu: 'arm64' },
  { goos: 'windows', goarch: 'amd64', os: 'win32', cpu: 'x64' },
];

function option(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  if (index !== -1 && process.argv[index + 1]) return process.argv[index + 1];
  if (fallback !== undefined) return fallback;
  throw new Error(`--${name} is required`);
}

const version = option('version').replace(/^v/, '');
if (!/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(version)) {
  throw new Error(`"${version}" is not a semver version`);
}
const out = resolve(root, option('out', 'release/npm'));
const only = process.argv.includes('--host-only')
  ? targets.filter(t => t.os === process.platform && t.cpu === process.arch)
  : targets;

const template = JSON.parse(readFileSync(join(root, 'npm/cli/package.json'), 'utf8'));
const license = join(root, 'LICENSE');

rmSync(out, { recursive: true, force: true });

for (const target of only) {
  const name = `@kurlo/${target.os}-${target.cpu}`;
  const dir = join(out, name);
  const exe = target.os === 'win32' ? 'kurlo.exe' : 'kurlo';
  mkdirSync(join(dir, 'bin'), { recursive: true });

  execFileSync('go', [
    'build',
    '-trimpath',
    '-ldflags', `-s -w -X ${goModule}.appVersion=${version}`,
    '-o', join(dir, 'bin', exe),
    './cmd/kurlo',
  ], {
    cwd: join(root, 'apps/desktop'),
    stdio: 'inherit',
    env: { ...process.env, CGO_ENABLED: '0', GOOS: target.goos, GOARCH: target.goarch },
  });
  chmodSync(join(dir, 'bin', exe), 0o755);

  writeFileSync(join(dir, 'package.json'), `${JSON.stringify({
    name,
    version,
    description: `The ${target.os} ${target.cpu} binary for @kurlo/cli.`,
    homepage: template.homepage,
    repository: { ...template.repository, directory: 'npm/cli' },
    license: template.license,
    os: [target.os],
    cpu: [target.cpu],
    files: ['bin'],
    preferUnplugged: true,
    publishConfig: template.publishConfig,
  }, null, 2)}\n`);
  writeFileSync(join(dir, 'README.md'), `# ${name}\n\nThe ${target.os} ${target.cpu} binary of [@kurlo/cli](https://www.npmjs.com/package/@kurlo/cli). Install \`@kurlo/cli\` instead; npm picks this package for you.\n`);
  copyFileSync(license, join(dir, 'LICENSE'));
}

const main = join(out, '@kurlo', 'cli');
cpSync(join(root, 'npm/cli'), main, { recursive: true });
copyFileSync(license, join(main, 'LICENSE'));
writeFileSync(join(main, 'package.json'), `${JSON.stringify({
  ...template,
  version,
  optionalDependencies: Object.fromEntries(targets.map(t => [`@kurlo/${t.os}-${t.cpu}`, version])),
}, null, 2)}\n`);

console.log(`npm packages for ${version} written to ${out}`);
