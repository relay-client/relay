# Relay Performance Fixtures

This folder contains reproducible fixture definitions for local performance testing. Generated payloads are intentionally ignored by Git because the default set can be hundreds of megabytes.

Generate the default stress set:

```bash
npm run perf:fixtures
```

Generate a smaller smoke set:

```bash
npm run perf:fixtures -- --requests 250 --folders 50 --history 500 --response-mb 2
```

Outputs are written to `perf/fixtures/`:

- `request-store-large.json` - local request store payload with many collections, folders, requests, history entries, environments, and cookies.
- `huge-response.json` - large response body for response viewer rendering/search tests.
- `relay-yaml-large/` - Git/YAML workspace fixture matching Relay's `workspace-yaml` layout.
- `manifest.json` - counts, generated paths, and suggested manual checks.

Primary checks:

- Load `request-store-large.json` through the all-data import path or by using it as a local request-store payload in a dev build.
- Open the collections sidebar and verify folder expand/collapse/search stay responsive.
- Switch to history and verify date collapse/search do not shift layout.
- Open `huge-response.json` in a request response fixture and verify raw/view/search pagination.
- Open `relay-yaml-large/` as a folder workspace and verify diagnostics remain clean.
