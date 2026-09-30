import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const master = join(root, 'apps', 'desktop', 'build', 'appicon.png');

const ogPath = join(root, 'apps', 'web', 'public', 'og.png');

const tile = await sharp(master).trim({ threshold: 1 }).png().toBuffer();

const derived = [
  { path: join(root, 'apps', 'desktop', 'frontend', 'src', 'lib', 'assets', 'relay-mark.png'), size: 144 },
  { path: join(root, 'apps', 'web', 'src', 'assets', 'logo.png'), size: 128 },
  { path: join(root, 'apps', 'web', 'public', 'favicon-32.png'), size: 32 },
  { path: join(root, 'apps', 'web', 'public', 'apple-touch-icon.png'), size: 180 },
  { path: join(root, 'apps', 'extension', 'icons', 'icon-16.png'), size: 16 },
  { path: join(root, 'apps', 'extension', 'icons', 'icon-32.png'), size: 32 },
  { path: join(root, 'apps', 'extension', 'icons', 'icon-48.png'), size: 48 },
  { path: join(root, 'apps', 'extension', 'icons', 'icon-128.png'), size: 128 },
];

for (const { path, size } of derived) {
  mkdirSync(dirname(path), { recursive: true });
  await sharp(tile).resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toFile(path);
  console.log('wrote', path);
}

const ogSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="ogBg" x1="0" y1="0" x2="1200" y2="630" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#0c0c0e"/>
      <stop offset="0.5" stop-color="#111113"/>
      <stop offset="1" stop-color="#17171b"/>
    </linearGradient>
    <radialGradient id="ogGlow" cx="430" cy="350" r="520" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#5865f2" stop-opacity="0.22"/>
      <stop offset="0.52" stop-color="#5865f2" stop-opacity="0.07"/>
      <stop offset="1" stop-color="#5865f2" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#ogBg)"/>
  <rect width="1200" height="630" fill="url(#ogGlow)"/>
  <text x="500" y="187" fill="#aab2ff" font-family="Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif" font-size="22" letter-spacing="4">RELAY</text>
  <text x="500" y="292" fill="#ececef" font-family="Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif" font-size="94" font-weight="500">API client.</text>
  <text x="500" y="356" fill="#c9c9d1" font-family="Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif" font-size="34" font-weight="500">Local-first.</text>
  <text x="500" y="409" fill="#a6a6ae" font-family="Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif" font-size="25">No accounts. No cloud sync. No telemetry.</text>
  <text x="500" y="479" fill="#85858e" font-family="ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" font-size="19" letter-spacing="3">macOS   ·   Windows   ·   Linux</text>
</svg>`;

await sharp(Buffer.from(ogSvg))
  .composite([{ input: await sharp(tile).resize(320, 320).png().toBuffer(), left: 110, top: 155 }])
  .png()
  .toFile(ogPath);

console.log('wrote', ogPath);
