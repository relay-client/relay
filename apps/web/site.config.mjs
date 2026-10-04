export {
  GITHUB_LATEST_API,
  GITHUB_LATEST_RELEASE,
  GITHUB_OWNER,
  GITHUB_RELEASES,
  GITHUB_REPO,
  GITHUB_SOURCE,
  PRIMARY_DOMAIN,
  SITE_NAME,
  SITE_TAGLINE,
} from './site.constants.mjs';

import { PRIMARY_DOMAIN } from './site.constants.mjs';

function fromEnv(name, fallback) {
  const value = process.env[name];
  return value && value.trim() ? value.trim() : fallback;
}

export const SITE_URL = fromEnv('KURLO_SITE_URL', `https://${PRIMARY_DOMAIN}`).replace(/\/+$/, '');
export const SITE_BASE = fromEnv('KURLO_SITE_BASE', '/');
export const SITE_BASE_PATH = SITE_BASE.endsWith('/') ? SITE_BASE.slice(0, -1) : SITE_BASE;

export function absolute(path = '/') {
  return `${SITE_URL}${SITE_BASE_PATH}${path.startsWith('/') ? path : `/${path}`}`;
}
