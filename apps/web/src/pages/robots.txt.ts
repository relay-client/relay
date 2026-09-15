import type { APIRoute } from 'astro';

// Generated rather than kept in public/, so the sitemap URL follows whatever domain and
// base the build was given instead of drifting out of date after a move.
export const GET: APIRoute = ({ site }) => {
  const base = import.meta.env.BASE_URL.endsWith('/')
    ? import.meta.env.BASE_URL
    : `${import.meta.env.BASE_URL}/`;
  const sitemap = site ? new URL(`${base}sitemap-index.xml`, site).href : null;

  const body = [
    'User-agent: *',
    'Allow: /',
    '',
    ...(sitemap ? [`Sitemap: ${sitemap}`] : []),
  ].join('\n');

  return new Response(`${body}\n`, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
};
