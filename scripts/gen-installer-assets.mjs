import sharp from 'sharp';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const build = join(root, 'apps/desktop/build');
const icon = await sharp(join(build, 'appicon.png')).trim().png().toBuffer();
const mark = icon.toString('base64');
const font = 'Arial, Helvetica, sans-serif';
const svg = (width, height, content) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${content}</svg>`);
const logo = (x, y, size) => `<image href="data:image/png;base64,${mark}" x="${x}" y="${y}" width="${size}" height="${size}"/>`;
const text = (x, y, size, color, label, extra = '') => `<text x="${x}" y="${y}" font-family="${font}" font-size="${size}" fill="${color}" ${extra}>${label}</text>`;

async function bmp(input, path) {
  const { data, info } = await sharp(input).flatten({ background: '#ffffff' }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const stride = Math.ceil(info.width * 3 / 4) * 4;
  const result = Buffer.alloc(54 + stride * info.height);
  result.write('BM');
  result.writeUInt32LE(result.length, 2);
  result.writeUInt32LE(54, 10);
  result.writeUInt32LE(40, 14);
  result.writeInt32LE(info.width, 18);
  result.writeInt32LE(info.height, 22);
  result.writeUInt16LE(1, 26);
  result.writeUInt16LE(24, 28);
  result.writeUInt32LE(stride * info.height, 34);
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      const src = (y * info.width + x) * 3;
      const dst = 54 + (info.height - 1 - y) * stride + x * 3;
      result[dst] = data[src + 2];
      result[dst + 1] = data[src + 1];
      result[dst + 2] = data[src];
    }
  }
  writeFileSync(path, result);
}

const windows = join(build, 'windows/installer/assets');
const darwin = join(build, 'darwin/assets');
mkdirSync(windows, { recursive: true });
mkdirSync(darwin, { recursive: true });
const welcome = svg(328, 628, `
  <defs><linearGradient id="bg" x2="1" y2="1"><stop stop-color="#111322"/><stop offset="1" stop-color="#232a63"/></linearGradient></defs>
  <rect width="328" height="628" fill="url(#bg)"/>
  <circle cx="305" cy="350" r="175" fill="none" stroke="#6672df" stroke-opacity=".18"/>
  <circle cx="305" cy="350" r="125" fill="none" stroke="#6672df" stroke-opacity=".18"/>
  ${logo(36, 54, 90)}
  ${text(36, 194, 46, '#ffffff', 'Kurlo', 'font-weight="bold"')}
  ${text(36, 240, 21, '#c3c8f6', 'Your APIs.')}
  ${text(36, 272, 21, '#c3c8f6', 'Your workspace.')}
  <rect x="36" y="506" width="38" height="4" rx="2" fill="#8993ff"/>
  ${text(36, 549, 17, '#c3c8f6', 'Local-first API client')}
  ${text(36, 577, 15, '#a2a9d3', 'No account required.')}
`);
await bmp(welcome, join(windows, 'welcome.bmp'));
await sharp(welcome).png().toFile(join(windows, 'welcome.png'));
await bmp(svg(300, 114, `<rect width="300" height="114" fill="#ffffff"/>${text(38, 70, 32, '#292d45', 'Kurlo', 'font-weight="bold"')}${logo(206, 21, 72)}`), join(windows, 'header.bmp'));

const dmgBackground = svg(720, 460, `
  <defs><linearGradient id="bg" x2="1" y2="1"><stop stop-color="#f8f9ff"/><stop offset="1" stop-color="#e9edff"/></linearGradient></defs>
  <rect width="720" height="460" fill="url(#bg)"/>
  ${logo(42, 34, 48)}
  ${text(106, 68, 30, '#232842', 'Kurlo', 'font-weight="bold"')}
  ${text(42, 119, 18, '#636b88', 'Your APIs. Your workspace.')}
  <path d="M42 148H678" stroke="#d7dcf0"/>
  <rect x="107" y="176" width="166" height="166" rx="32" fill="#ffffff" fill-opacity=".65" stroke="#d9def1"/>
  <rect x="447" y="176" width="166" height="166" rx="32" fill="#ffffff" fill-opacity=".65" stroke="#d9def1"/>
  <path d="M321 254H396M380 238L396 254L380 270" fill="none" stroke="#5865f2" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
  ${text(360, 393, 20, '#232842', 'Drag Kurlo into Applications', 'text-anchor="middle" font-weight="bold"')}
  ${text(360, 424, 14, '#636b88', 'Then open Kurlo from your Applications folder.', 'text-anchor="middle"')}
`);
await sharp(dmgBackground).png().toFile(join(darwin, 'dmg-background.png'));
await sharp(dmgBackground, { density: 144 }).withMetadata({ density: 144 }).png().toFile(join(darwin, 'dmg-background@2x.png'));
console.log('Installer artwork regenerated.');
