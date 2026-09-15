# Relay web (landing + docs)

Astro Starlight project that powers the public Relay site:

- `/` — splash landing with hero, features, scripting demo, CTAs.
- `/download/` — platform picker, with `/download/macos/`, `/download/windows/`, and `/download/linux/` underneath.
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

Everything domain-shaped lives in `site.config.mjs`: `PRIMARY_DOMAIN` and the GitHub
coordinates derived from it. `astro.config.mjs`, the download pages, the JSON-LD, and
`src/pages/robots.txt.ts` all read from there, so a move is a one-line change plus DNS.

`RELAY_SITE_URL` and `RELAY_SITE_BASE` override the defaults at build time for staging
deploys. Empty values are treated as unset, which matters because GitHub Actions passes
unset repository variables through as empty strings.

To move the site to `relayclient.io`:

1. **DNS at the registrar.** For the apex, four `A` records to GitHub's Pages addresses —
   `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153` (and the
   matching `AAAA` records `2606:50c0:8000::153`, `:8001::153`, `:8002::153`, `:8003::153`
   if you want IPv6). Add a `CNAME` for `www` pointing at `relay-client.github.io`.
2. **GitHub Pages.** Repo → Settings → Pages → Custom domain → `relayclient.io`, then wait
   for the certificate and tick **Enforce HTTPS**. `apps/web/public/CNAME` already carries
   the domain, so the Actions deploy keeps it on every build.
3. **Redirects are automatic.** Once a custom domain is attached, GitHub 301-redirects
   `relay-client.github.io/*` to the same path on the custom domain — the old links keep
   their ranking signals, so do not disable the Pages site.
4. **Search Console.** Add `relayclient.io` as a property, submit
   `https://relayclient.io/sitemap-index.xml`, and use the Change of Address tool on the
   old `relay-client.github.io` property.
5. **Do not** serve the same content on a second domain. Point extra domains
   (`relayclient.dev`, `relayclient.org`) at the canonical one with a registrar-level
   redirect instead, or the duplicate splits ranking.

## Maintenance notes

- Keep `src/content/docs/changelog.md` aligned with the notable changes in the root `CHANGELOG.md`; exact per-tag notes live in `relay-client/relay` releases.
- Keep installation/signing language aligned with `.github/workflows/release.yml`. Update signatures and installer signatures are separate concerns.
- The download pages match release assets by filename suffix (`-darwin-universal.dmg`, `-windows-amd64-installer.exe`, `-linux-amd64.AppImage`). Renaming an artifact in `release.yml` means updating `PLATFORMS` in `site.config.mjs`.
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
│   │   ├── download.mdx      # /download — platform picker
│   │   ├── download/         # /download/macos, /windows, /linux
│   │   ├── changelog.md      # /changelog
│   │   └── docs/             # /docs/* — actual documentation tree
│   ├── components/           # DownloadPanel, DownloadSchema
│   ├── pages/robots.txt.ts   # robots.txt, generated from `site`
│   └── styles/custom.css     # brand tokens, splash refinements
├── site.config.mjs           # domain, GitHub coordinates, download assets
└── public/                   # static files served as-is (CNAME, og.png, icons)
```

## Notes on the docs subtree

Starlight is mounted at the site root — so all content lives under `src/content/docs/`. To give docs a `/docs/` URL prefix, the docs themselves live inside an extra `docs/` folder: `src/content/docs/docs/getting-started/installation.md` → `/docs/getting-started/installation/`. The splash landing and download page sit alongside as siblings (no `/docs/` prefix). The sidebar is curated explicitly in `astro.config.mjs`, so the docs subtree never bleeds into the landing.
