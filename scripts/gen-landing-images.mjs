import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const screenshots = join(root, 'apps', 'web', 'src', 'assets', 'screenshots');
const output = join(root, 'apps', 'web', 'src', 'assets', 'landing');

const crops = [
  { source: 'mock-server.png', target: 'mock-server.png', region: { left: 660, top: 0, width: 1740, height: 1010 } },
  { source: 'git-workspace.png', target: 'git-workspace.png', region: { left: 660, top: 0, width: 1740, height: 1400 } },
];

mkdirSync(output, { recursive: true });
for (const { source, target, region } of crops) {
  const path = join(output, target);
  await sharp(join(screenshots, source)).extract(region).png().toFile(path);
  console.log('wrote', path);
}
