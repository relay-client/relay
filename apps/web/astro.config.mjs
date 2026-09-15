
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import sitemap from '@astrojs/sitemap';
import { unified } from '@astrojs/markdown-remark';

import {
  GITHUB_RELEASES,
  GITHUB_SOURCE,
  SITE_BASE,
  SITE_BASE_PATH,
  SITE_NAME,
  SITE_TAGLINE,
  SITE_URL,
} from './site.config.mjs';

const SITE = SITE_URL;
const BASE = SITE_BASE;
const BASE_NORMALIZED = SITE_BASE_PATH;

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
      title: SITE_NAME,
      description: SITE_TAGLINE,
      logo: {
        src: './src/assets/logo.png',
        replacesTitle: false,
      },
      favicon: '/favicon-32.png',
      customCss: ['./src/styles/custom.css'],
      social: [{ icon: 'github', label: 'GitHub', href: GITHUB_SOURCE }],
      head: [
        {
          tag: 'meta',
          attrs: { property: 'og:site_name', content: SITE_NAME },
        },
        {
          tag: 'meta',
          attrs: { property: 'og:type', content: 'website' },
        },
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
          attrs: { rel: 'apple-touch-icon', href: `${BASE_NORMALIZED}/apple-touch-icon.png` },
        },
        {
          // The splash header is transparent while it sits on the hero and takes on the page
          // surface once you scroll past it.
          tag: 'script',
          content: `(() => {
  const mark = () => {
    document.documentElement.dataset.heroScrolled = String(window.scrollY > 24);
  };
  const start = () => {
    if (!document.querySelector('.relay-hero')) return;
    mark();
    addEventListener('scroll', mark, { passive: true });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();`,
        },

      ],
      sidebar: [
        {
          label: 'Download',
          items: [
            { label: 'All platforms', link: '/download/' },
            { label: 'Relay for macOS', link: '/download/macos/' },
            { label: 'Relay for Windows', link: '/download/windows/' },
            { label: 'Relay for Linux', link: '/download/linux/' },
          ],
        },
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
            { label: 'Response examples', link: '/docs/guides/examples/' },
            { label: 'Mock server', link: '/docs/guides/mock-server/' },
            { label: 'Per-request settings', link: '/docs/guides/request-settings/' },
            { label: 'Browser security emulation', link: '/docs/guides/browser-security/' },
            { label: 'Proxy configuration', link: '/docs/guides/proxy/' },
            { label: 'Cookies', link: '/docs/guides/cookies/' },
            { label: 'Request history', link: '/docs/guides/history/' },
            { label: 'Scripting (pre-request & tests)', link: '/docs/guides/scripting/' },
            { label: 'Collection Runner', link: '/docs/guides/collection-runner/' },
            { label: 'CLI runner (relay run)', link: '/docs/guides/cli-runner/' },
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
