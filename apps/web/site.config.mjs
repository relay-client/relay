// Single source of truth for everything that changes when the site moves to a new
// domain. The build reads RELAY_SITE_URL / RELAY_SITE_BASE when they are set, so a
// preview deploy can point somewhere else without touching this file.
//
// GitHub Actions passes repository variables through as empty strings when they are
// not configured, so an empty value has to fall back the same way a missing one does.
function fromEnv(name, fallback) {
  const value = process.env[name];
  return value && value.trim() ? value.trim() : fallback;
}

/** The canonical host. Also written into dist/CNAME for GitHub Pages. */
export const PRIMARY_DOMAIN = 'relayclient.io';

export const SITE_URL = fromEnv('RELAY_SITE_URL', `https://${PRIMARY_DOMAIN}`).replace(/\/+$/, '');
export const SITE_BASE = fromEnv('RELAY_SITE_BASE', '/');
/** Base without its trailing slash, so `${SITE_BASE_PATH}/og.png` works at any base. */
export const SITE_BASE_PATH = SITE_BASE.endsWith('/') ? SITE_BASE.slice(0, -1) : SITE_BASE;

export const SITE_NAME = 'Relay';
export const SITE_TAGLINE = 'A fast, local-first desktop API client. No accounts, no cloud sync, no telemetry.';

export const GITHUB_OWNER = 'relay-client';
export const GITHUB_REPO = 'relay';
export const GITHUB_SOURCE = `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}`;
export const GITHUB_RELEASES = `${GITHUB_SOURCE}/releases`;
export const GITHUB_LATEST_RELEASE = `${GITHUB_RELEASES}/latest`;
/** Public, CORS-enabled, and rate limited per visitor IP rather than per site. */
export const GITHUB_LATEST_API = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`;

/** Absolute URL for a site-relative path, base included. */
export function absolute(path = '/') {
  return `${SITE_URL}${SITE_BASE_PATH}${path.startsWith('/') ? path : `/${path}`}`;
}

// Release assets are version-stamped (relay-1.8.1-darwin-universal.dmg), so the
// download pages match on the suffix and resolve the exact file at runtime.
export const PLATFORMS = {
  macos: {
    slug: 'macos',
    name: 'macOS',
    os: 'macOS',
    schemaOs: 'macOS 11.0',
    requirements: 'macOS 11 Big Sur or later. Universal — Apple Silicon and Intel.',
    assets: [
      {
        label: 'Download .dmg',
        suffix: '-darwin-universal.dmg',
        note: 'Universal disk image — the normal way to install.',
        primary: true,
      },
      {
        label: 'Raw binary',
        exact: 'relay-darwin-universal',
        note: 'Unpackaged universal binary, the same file the updater downloads.',
      },
    ],
  },
  windows: {
    slug: 'windows',
    name: 'Windows',
    os: 'Windows',
    schemaOs: 'Windows 10, Windows 11',
    requirements: 'Windows 10 version 1903 or later, or Windows 11. x64.',
    assets: [
      {
        label: 'Download installer (.exe)',
        suffix: '-windows-amd64-installer.exe',
        note: 'NSIS installer — the normal way to install.',
        primary: true,
      },
      {
        label: 'Download .msix',
        suffix: '-windows-amd64.msix',
        note: 'Packaged install. Installable only when that release was signed with the configured publisher certificate.',
      },
      {
        label: 'Portable .exe',
        exact: 'relay-windows-amd64.exe',
        note: 'No installer, no shortcuts — run it from anywhere.',
      },
    ],
  },
  linux: {
    slug: 'linux',
    name: 'Linux',
    os: 'Linux',
    schemaOs: 'Linux',
    requirements: 'glibc 2.31 or later, libgtk-3 and libwebkit2gtk-4.0. x64.',
    assets: [
      {
        label: 'Download .AppImage',
        suffix: '-linux-amd64.AppImage',
        note: 'Portable, nothing to install — chmod +x and run.',
        primary: true,
      },
      {
        label: 'Raw binary',
        exact: 'relay-linux-amd64',
        note: 'The bare executable, without the AppImage wrapper.',
      },
    ],
  },
};

export const PLATFORM_LIST = [PLATFORMS.macos, PLATFORMS.windows, PLATFORMS.linux];
