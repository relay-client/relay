import { GITHUB_LATEST_API } from '../../site.constants.mjs';

export interface ReleaseAsset {
  name: string;
  browser_download_url: string;
  size: number;
}

export interface Release {
  tag_name?: string;
  published_at?: string;
  assets?: ReleaseAsset[];
}

const CACHE_KEY = 'relay:latest-release';
const CACHE_MS = 30 * 60 * 1000;

export function formatSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '';
  const mb = bytes / 1024 / 1024;
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${Math.round(mb)} MB`;
}

export function findAsset(release: Release, suffix: string): ReleaseAsset | undefined {
  return (release.assets ?? []).find(asset => asset.name.endsWith(suffix));
}

function cached(): Release | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const entry = JSON.parse(raw);
    return Date.now() - entry.at < CACHE_MS ? (entry.release as Release) : null;
  } catch {
    return null;
  }
}

export async function latestRelease(): Promise<Release | null> {
  const hit = cached();
  if (hit) return hit;

  try {
    const response = await fetch(GITHUB_LATEST_API, { headers: { Accept: 'application/vnd.github+json' } });
    if (!response.ok) return null;
    const release = (await response.json()) as Release;
    if (!release.assets?.length) return null;
    try {
      sessionStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), release }));
    } catch {}
    return release;
  } catch {
    return null;
  }
}
