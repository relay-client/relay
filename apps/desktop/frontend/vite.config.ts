import { svelte } from '@sveltejs/vite-plugin-svelte';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';

// The repo changelog lives outside the frontend package, so Rollup can't
// resolve a relative import to it. Serve it as a virtual module instead: the
// "What's new" screen needs the notes bundled so it works offline and always
// matches the build that is running.
const CHANGELOG_PATH = resolve(import.meta.dirname, '../../../CHANGELOG.md');
const CHANGELOG_ID = 'virtual:relay-changelog';
const CHANGELOG_RESOLVED_ID = '\0' + CHANGELOG_ID;

export default defineConfig({
  plugins: [
    svelte(),
    {
      name: 'relay-changelog',
      resolveId(id) {
        return id === CHANGELOG_ID ? CHANGELOG_RESOLVED_ID : null;
      },
      load(id) {
        if (id !== CHANGELOG_RESOLVED_ID) return null;
        this.addWatchFile(CHANGELOG_PATH);
        let markdown = '';
        try {
          markdown = readFileSync(CHANGELOG_PATH, 'utf8');
        } catch {
          // A missing changelog just means no notes to show; never fail the build.
        }
        return `export default ${JSON.stringify(markdown)};`;
      }
    },
    {
      name: 'keep-wails-dist-placeholder',
      closeBundle() {
        writeFileSync(resolve('dist/.gitkeep'), '');
      }
    }
  ],
  clearScreen: false,
  server: {
    host: '127.0.0.1',
    strictPort: false
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          const normalizedId = id.replaceAll('\\', '/');
          if (normalizedId.includes('/node_modules/@codemirror/view') || normalizedId.includes('/node_modules/@codemirror/state')) return 'editor-core';
          if (normalizedId.includes('/node_modules/@codemirror/lang-json') || normalizedId.includes('/node_modules/@lezer/json')) return 'editor-lang-json';
          if (normalizedId.includes('/node_modules/@codemirror/lang-javascript') || normalizedId.includes('/node_modules/@lezer/javascript')) return 'editor-lang-javascript';
          if (normalizedId.includes('/node_modules/@codemirror/lang-html') || normalizedId.includes('/node_modules/@codemirror/lang-css') || normalizedId.includes('/node_modules/@lezer/html') || normalizedId.includes('/node_modules/@lezer/css')) return 'editor-lang-html';
          if (normalizedId.includes('/node_modules/@codemirror/lang-xml') || normalizedId.includes('/node_modules/@lezer/xml')) return 'editor-lang-xml';
          if (normalizedId.includes('/node_modules/@codemirror/') || normalizedId.includes('/node_modules/codemirror/')) return 'editor-extensions';
          if (normalizedId.includes('/node_modules/@lezer/')) return 'editor-parsers';
          if (normalizedId.includes('/node_modules/style-mod/') || normalizedId.includes('/node_modules/w3c-keyname/') || normalizedId.includes('/node_modules/crelt/')) return 'editor-runtime';
          if (normalizedId.includes('/src/lib/stores/features/')) return 'app-features';
          if (normalizedId.includes('/src/lib/stores/app.svelte.ts') || normalizedId.includes('/src/lib/stores/lazyComponents.svelte.ts')) return 'app-state';
          if (normalizedId.includes('/src/lib/backend.ts')) return 'backend-api';
        }
      }
    }
  }
});
