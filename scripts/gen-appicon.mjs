import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// One master, every mark. The master is the icon Wails ships — the one in the Dock, the
// taskbar and the installer — and every other mark is a resize of it. Hand-redrawn SVG
// copies in the docs, the sidebar and the extension are how the app ended up with five
// slightly different icons.
//
// `appicon_backup.png` is the original full-bleed artwork this was drawn from. It is
// deliberately NOT the master: the shipped icon insets the tile to leave macOS its safe
// area, and overwriting the shipped file from the backup changes the icon people see.
//
// The derived marks are trimmed to the tile, because that transparent inset is only useful
// to a platform icon. Trimming changes the padding, never the artwork.
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const master = join(root, 'apps', 'desktop', 'build', 'appicon.png');

const ogPath = join(root, 'apps', 'web', 'public', 'og.png');

const tile = await sharp(master).trim({ threshold: 1 }).png().toBuffer();

const derived = [
  // The mark in the desktop app's own sidebar.
  { path: join(root, 'apps', 'desktop', 'frontend', 'src', 'lib', 'assets', 'relay-mark.png'), size: 144 },
  // Docs site: header logo, hero badge, tab icon, iOS home screen.
  { path: join(root, 'apps', 'web', 'src', 'assets', 'logo.png'), size: 128 },
  { path: join(root, 'apps', 'web', 'public', 'favicon-32.png'), size: 32 },
  { path: join(root, 'apps', 'web', 'public', 'apple-touch-icon.png'), size: 180 },
  // Browser extension.
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
  .composite([{ input: await sharp(tile).resize(320, 320).png().toBuffer(), left: 110, top: 155 }])
  .png()
  .toFile(ogPath);

console.log('wrote', ogPath);
