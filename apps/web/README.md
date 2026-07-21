# Relay web (landing + docs)

Astro Starlight project that powers the public Relay site:

- `/` — splash landing with hero, features, scripting demo, CTAs.
- `/download/` — installer matrix for macOS / Windows / Linux.
- `/docs/...` — full documentation: getting started, guides, reference, FAQ.
- `/changelog/` — notable changes plus a link to tag-specific release notes.

## Local development

From the repo root:

```sh
npm install            # installs all workspaces, including apps/web
npm run web:dev        # starts Astro dev server on http://localhost:4321
```

Or from this directory:

```sh
npm install
npm run dev
```

## Build

```sh
npm run web:build      # outputs to apps/web/dist/
npm run web:preview    # serves the production build locally
```

## Deploy options

The build output is a static site (`apps/web/dist/`). Pick whichever host you prefer:

- **GitHub Pages** — push `dist/` to `gh-pages`, or use the workflow stub at `.github/workflows/web-deploy.yml`. Cheapest if you already use GitHub.
- **Cloudflare Pages** — connect the source repo, set build command `npm run web:build`, output dir `apps/web/dist`. Free TLS, fast CDN.
- **Netlify / Vercel** — same idea, slightly different DX. Set the build root to `apps/web`.

### Custom domain

In `astro.config.mjs` set `site` to the canonical URL (e.g. `https://relay.app`). For GitHub Pages, also add a `CNAME` file under `apps/web/public/`.

## Maintenance notes

- Keep `src/content/docs/changelog.md` aligned with the notable changes in the root `CHANGELOG.md`; exact per-tag notes live in `relay-client/relay` releases.
- Keep installation/signing language aligned with `.github/workflows/release.yml`. Update signatures and installer signatures are separate concerns.
- Update `DOCS_COVERAGE.md` whenever a user-facing feature, setting, limit, or screenshot changes.
- Replace empty-state screenshots with populated workflows as the screenshot pass progresses.

## Project structure

```
apps/web/
├── astro.config.mjs          # Starlight config, sidebar, social links
├── src/
│   ├── assets/               # in-repo images referenced from MDX
│   ├── content.config.ts     # Starlight content collection loader
│   ├── content/docs/
│   │   ├── index.mdx         # /  splash landing
│   │   ├── download.mdx      # /download
│   │   ├── changelog.md      # /changelog
│   │   └── docs/             # /docs/* — actual documentation tree
│   └── styles/custom.css     # brand tokens, splash refinements
└── public/                   # static files served as-is
```

## Notes on the docs subtree

Starlight is mounted at the site root — so all content lives under `src/content/docs/`. To give docs a `/docs/` URL prefix, the docs themselves live inside an extra `docs/` folder: `src/content/docs/docs/getting-started/installation.md` → `/docs/getting-started/installation/`. The splash landing and download page sit alongside as siblings (no `/docs/` prefix). The sidebar is curated explicitly in `astro.config.mjs`, so the docs subtree never bleeds into the landing.
