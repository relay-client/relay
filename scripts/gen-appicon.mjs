import sharp from 'sharp';
import { copyFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const appIconSourcePath = join(root, 'apps', 'desktop', 'build', 'appicon_backup.png');
const appIconPath = join(root, 'apps', 'desktop', 'build', 'appicon.png');
const ogPath = join(root, 'apps', 'web', 'public', 'og.png');

// Keep the desktop bundle on the original app icon exactly.
copyFileSync(appIconSourcePath, appIconPath);

const ogSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="ogBg" x1="0" y1="0" x2="1200" y2="630" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#0b0d24"/>
      <stop offset="0.5" stop-color="#171442"/>
      <stop offset="1" stop-color="#26235f"/>
    </linearGradient>
    <radialGradient id="ogGlow" cx="430" cy="350" r="520" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#6045f4" stop-opacity="0.24"/>
      <stop offset="0.52" stop-color="#2fb8d7" stop-opacity="0.09"/>
      <stop offset="1" stop-color="#2fb8d7" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#ogBg)"/>
  <rect width="1200" height="630" fill="url(#ogGlow)"/>
  <text x="500" y="187" fill="#a7a0ff" font-family="Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif" font-size="22" letter-spacing="4">RELAY</text>
  <text x="500" y="292" fill="#f8f7ff" font-family="Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif" font-size="94" font-weight="500">API client.</text>
  <text x="500" y="356" fill="#d7d4ef" font-family="Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif" font-size="34" font-weight="500">Local-first.</text>
  <text x="500" y="409" fill="#b9b4d4" font-family="Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif" font-size="25">No accounts. No cloud sync. No telemetry.</text>
  <text x="500" y="479" fill="#918bb7" font-family="ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" font-size="19" letter-spacing="3">macOS   ·   Windows   ·   Linux</text>
</svg>`;

await sharp(Buffer.from(ogSvg))
  .composite([
    {
      input: await sharp(appIconSourcePath).resize(320, 320).png().toBuffer(),
      left: 110,
      top: 155,
    },
  ])
  .png()
  .toFile(ogPath);

console.log('wrote', appIconPath);
console.log('wrote', ogPath);
