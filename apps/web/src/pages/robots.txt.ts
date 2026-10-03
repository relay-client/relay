import type { APIRoute } from 'astro';

export const GET: APIRoute = ({ site }) => {
  const base = import.meta.env.BASE_URL.endsWith('/')
    ? import.meta.env.BASE_URL
    : `${import.meta.env.BASE_URL}/`;
  const sitemap = site ? new URL(`${base}sitemap-index.xml`, site).href : null;

  const body = ['User-agent: *', 'Allow: /', '', ...(sitemap ? [`Sitemap: ${sitemap}`] : [])].join('\n');

  return new Response(`${body}\n`, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
};
