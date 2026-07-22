
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import sitemap from '@astrojs/sitemap';
import { unified } from '@astrojs/markdown-remark';







const SITE = process.env.RELAY_SITE_URL ?? 'https://relay-client.github.io';
const BASE = process.env.RELAY_SITE_BASE ?? '/';
const BASE_NORMALIZED = BASE.endsWith('/') ? BASE.slice(0, -1) : BASE;

const GITHUB_SOURCE = 'https://github.com/relay-client/relay';
const GITHUB_RELEASES = 'https://github.com/relay-client/relay';

// Starlight prefixes the deploy base onto the links it generates itself (sidebar,
// pagination, breadcrumbs) but not onto root-absolute links written by hand in
// markdown or MDX. On a project Pages deploy those become 404s, so rewrite them
// here rather than hard-coding the base into every document.
function rehypeBasePaths() {
  if (!BASE_NORMALIZED) return () => tree => tree;
  const prefixed = value =>
    typeof value === 'string' &&
    value.startsWith('/') &&
    !value.startsWith('//') &&
    !value.startsWith(`${BASE_NORMALIZED}/`);

  return () => tree => {
    const walk = node => {
      if (node.type === 'element' && node.properties) {
        for (const attribute of ['href', 'src']) {
          if (prefixed(node.properties[attribute])) {
            node.properties[attribute] = `${BASE_NORMALIZED}${node.properties[attribute]}`;
          }
        }
      }
      // Raw JSX inside MDX keeps its attributes on a separate node shape, so the
      // hand-written <a href="/…"> markup on the landing page needs this branch.
      if (Array.isArray(node.attributes)) {
        for (const attribute of node.attributes) {
          if (['href', 'src'].includes(attribute.name) && prefixed(attribute.value)) {
            attribute.value = `${BASE_NORMALIZED}${attribute.value}`;
          }
        }
      }
      for (const child of node.children ?? []) walk(child);
    };
    walk(tree);
    return tree;
  };
}

export default defineConfig({
  site: SITE,
  base: BASE,
  trailingSlash: 'always',
  markdown: {
    processor: unified({ rehypePlugins: [rehypeBasePaths()] }),
  },
  integrations: [
    starlight({
      title: 'Relay',
      description: 'A fast, local-first desktop API client. No accounts, no cloud sync, no telemetry.',
      logo: {
        src: './src/assets/logo.svg',
        replacesTitle: false,
      },
      favicon: '/favicon.svg',
      customCss: ['./src/styles/custom.css'],
      social: [{ icon: 'github', label: 'GitHub', href: GITHUB_SOURCE }],
      editLink: {
        baseUrl: `${GITHUB_SOURCE}/edit/main/apps/web/`,
      },
      head: [
        {
          tag: 'meta',
          attrs: { property: 'og:image', content: `${SITE}${BASE_NORMALIZED}/og.png` },
        },
        {
          tag: 'meta',
          attrs: { property: 'og:image:width', content: '1200' },
        },
        {
          tag: 'meta',
          attrs: { property: 'og:image:height', content: '630' },
        },
        {
          tag: 'meta',
          attrs: { name: 'twitter:card', content: 'summary_large_image' },
        },
        {
          tag: 'meta',
          attrs: { name: 'twitter:image', content: `${SITE}${BASE_NORMALIZED}/og.png` },
        },

        {
          tag: 'link',
          attrs: { rel: 'apple-touch-icon', href: `${BASE_NORMALIZED}/favicon.svg` },
        },


        {
          tag: 'script',
          attrs: { type: 'application/ld+json' },
          content: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'SoftwareApplication',
            name: 'Relay',
            description: 'A fast, local-first desktop API client. No accounts, no cloud sync, no telemetry.',
            applicationCategory: 'DeveloperApplication',
            operatingSystem: 'macOS, Windows, Linux',
            offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
            url: `${SITE}${BASE_NORMALIZED}/`,
            downloadUrl: GITHUB_RELEASES,
            sameAs: [GITHUB_SOURCE, GITHUB_RELEASES],
          }),
        },
      ],
      sidebar: [
        {
          label: 'Getting started',
          items: [
            { label: 'Installation', link: '/docs/getting-started/installation/' },
            { label: 'Your first request', link: '/docs/getting-started/first-request/' },
            { label: 'Migrating from Postman / Insomnia', link: '/docs/getting-started/migrating/' },
          ],
        },
        {
          label: 'Guides',
          items: [
            { label: 'App settings', link: '/docs/guides/settings/' },
            { label: 'Authentication', link: '/docs/guides/authentication/' },
            { label: 'Environments & variables', link: '/docs/guides/environments/' },
            { label: 'Workspaces & collections', link: '/docs/guides/workspaces/' },
            { label: 'Collection defaults', link: '/docs/guides/collection-defaults/' },
            { label: 'Request types', link: '/docs/guides/request-types/' },
            { label: 'Response viewer', link: '/docs/guides/response-viewer/' },
            { label: 'Per-request settings', link: '/docs/guides/request-settings/' },
            { label: 'Browser security emulation', link: '/docs/guides/browser-security/' },
            { label: 'Proxy configuration', link: '/docs/guides/proxy/' },
            { label: 'Cookies', link: '/docs/guides/cookies/' },
            { label: 'Request history', link: '/docs/guides/history/' },
            { label: 'Scripting (pre-request & tests)', link: '/docs/guides/scripting/' },
            { label: 'Collection Runner', link: '/docs/guides/collection-runner/' },
            { label: 'Git-backed workspaces', link: '/docs/guides/git-workspaces/' },
            { label: 'Import & export', link: '/docs/guides/import-export/' },
            { label: 'Backup & recovery', link: '/docs/guides/backup-recovery/' },
            { label: 'Code generation', link: '/docs/guides/code-generation/' },
          ],
        },
        {
          label: 'Reference',
          items: [
            { label: 'Scripting API', link: '/docs/reference/scripting-api/' },
            { label: 'Relay YAML format', link: '/docs/reference/relay-yaml-format/' },
            { label: 'Performance fixtures', link: '/docs/reference/performance-fixtures/' },
            { label: 'Keyboard shortcuts', link: '/docs/reference/keyboard-shortcuts/' },
          ],
        },
        {
          label: 'Help',
          items: [
            { label: 'Troubleshooting', link: '/docs/troubleshooting/' },
            { label: 'FAQ', link: '/docs/faq/' },
            { label: 'Privacy & security', link: '/privacy/' },
            { label: 'Changelog', link: '/changelog/' },
            { label: 'Releases', link: GITHUB_RELEASES, attrs: { target: '_blank' } },
          ],
        },
      ],
      lastUpdated: true,
      pagefind: true,
    }),
    sitemap(),
  ],
});
