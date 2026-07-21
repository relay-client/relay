---
title: Performance fixtures
description: Reproducible large workspaces and responses for local performance checks.
---

Relay includes a fixture generator for exercising the highest-risk UI and storage paths before a release: large sidebars, deep folder trees, request history, huge responses, and Git/YAML diagnostics.

Generated files are written to `perf/fixtures/` and are ignored by Git because the default set can be hundreds of megabytes.

## Generate fixtures

From the repository root:

```sh
npm run perf:fixtures
```

For a faster smoke set:

```sh
npm run perf:fixtures -- --requests 250 --folders 50 --history 500 --response-mb 2
```

Useful options:

| Option | Default | Meaning |
|--------|---------|---------|
| `--requests` | `5000` | Saved requests spread across collections and request types. |
| `--folders` | `500` | Nested folder paths preserved in collections and YAML workspaces. |
| `--history` | `10000` | Request history rows. |
| `--response-mb` | `50` | Approximate size of `huge-response.json`. |
| `--collections` | `5` | Collections in the generated workspace. |
| `--out` | `perf/fixtures` | Output directory. |

## Outputs

- `request-store-large.json` - all-data payload with workspaces, collections, folders, requests, environments, history, and cookies.
- `huge-response.json` - large JSON response body for response viewer rendering, paging, and search.
- `relay-yaml-large/` - Git/YAML workspace fixture using the public `workspace-yaml` layout.
- `manifest.json` - counts, generated paths, and suggested manual checks.

## P0 checks

Use the fixtures to smoke-test these surfaces after storage, sidebar, import/export, or response-viewer changes:

- Import `request-store-large.json` through the all-data import path.
- Open collections and verify expand/collapse, nested folders, search, and starred rows remain responsive.
- Open history and verify date collapse/search keep stable layout.
- Load `huge-response.json` into the response viewer and check raw view, paging, and search.
- Open `relay-yaml-large/` as a Git-backed workspace and confirm diagnostics stay clean.
- Toggle autosave/manual-save and verify request and environment dirty states behave the same way on large data.
