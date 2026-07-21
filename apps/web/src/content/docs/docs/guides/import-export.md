---
title: Import & export
description: Move collections and workspaces between Relay, Postman, Insomnia, Bruno/OpenCollection, OpenAPI, HAR, curl, and Git.
---

Relay supports both one-off interchange formats and full Relay backups. Imports are non-destructive unless you explicitly choose the all-data restore path.

## Supported sources

| Source | What Relay imports |
|--------|--------------------|
| Postman Collection v2.1 | Collections, nested folders, requests, auth, bodies, GraphQL, scripts, and environments through the environment importer. |
| Insomnia v4 JSON | Workspaces, folders, requests, auth, bodies, and environments. |
| Bruno/OpenCollection | Collections, explicit empty folders, requests, GraphQL, and supported metadata. |
| OpenAPI/Swagger | HTTP/SSE requests generated from operations. |
| HAR | Captured HTTP requests. |
| cURL | A single request pasted into the URL bar. |
| Relay all-data backup | Workspaces, collections, environments, requests, history, cookies, and selected UI/request preferences. |
| Relay Git/YAML workspace | Reviewable workspace files with local-only secrets. |

![Import source selector with Postman, Insomnia, OpenAPI, HAR, and Bruno options](../../../../assets/screenshots/import-postman.png)

## From Postman

Relay reads Postman Collection v2.1 — the JSON export, not the cloud-sync format.

1. In Postman: right-click the collection → **Export** → choose v2.1.
2. In Relay: click the **import** icon in the sidebar header (next to **+**) and pick the JSON file — or drag the file onto the sidebar.
3. Relay creates a new collection in the current workspace, preserving the folder tree.

What carries over:

- Folder hierarchy, request names, methods, URLs.
- Headers, query params, body (JSON, form-data, raw, urlencoded).
- Pre-request and test scripts. JavaScript scripts map to Relay's sandboxed JavaScript fields; legacy Tengo fields remain available for existing requests.
- Environments — imported from the sidebar's *Environments* view via its own import flow.

What doesn't:

- Postman cloud Mock Servers / Monitors.
- Visualizer scripts.
- Variable types beyond string/secret.

## From curl

Paste a curl command directly into the URL bar of a new request. Relay parses:

- Method (`-X`)
- Headers (`-H`)
- Body (`-d`, `--data-raw`, `--data-binary`)
- Basic auth (`-u`)
- Multipart fields (`-F`)

URL-only curl commands work too — `curl https://api.example.com/users` becomes a GET request.

## From Bruno/OpenCollection

Relay imports OpenCollection-style folders and request files. Empty folders are preserved explicitly, so a folder can exist before it contains a request.

Relay's OpenCollection export writes:

- `folder.yml` files for explicit folder paths.
- HTTP and GraphQL requests.
- Request-level scripts, settings, auth, params, headers, and bodies where the format supports them.

## Git-backed YAML workspaces

For team sharing, prefer Relay's Git/YAML storage over repeated JSON exports. It stores workspace state as plain YAML files:

- `relay.yml` and `workspaces/**/*.yml` are shared.
- Sensitive values become `{{relaySecret:...}}` placeholders; the real values remain in Relay's encrypted local profile outside the repository.
- Folder hierarchy is represented by `request.folderPath` plus `collection.folderPaths`, so empty folders survive round-trips.

See [Relay YAML format](/docs/reference/relay-yaml-format/) for the public contract.

## All-data backups

Use **Settings -> General -> Advanced data -> Export all data** for a Relay-to-Relay profile backup. Unlike collection interchange formats, it includes history, cookies, all local workspaces, and selected preferences.

The file is plaintext and can contain secrets. Import replaces the current local profile rather than merging it. See [Backup & recovery](/docs/guides/backup-recovery/) for the exact contents, exclusions, recovery-key behavior, and a safe restore procedure.

## Export

Relay can export a collection as Postman v2.1, OpenAPI, or OpenCollection, and can export its workspace data plus selected preferences as an all-data backup.

Secrets marked as **secret** are stripped, redacted, or kept as Relay secret placeholders depending on the target format. Git/YAML workspaces keep the real values in Relay's encrypted local profile, outside shared files.

## Sharing within a team

For day-to-day collaboration:

1. Use Git-backed YAML workspace storage.
2. Commit `relay.yml`, `.gitignore`, and `workspaces/**/*.yml`.
3. Keep `{{relaySecret:...}}` placeholders intact; Relay resolves them from each user's encrypted local profile.
4. Use import/export formats only for interoperability with another client.

For environment-specific variables, keep non-secret defaults in the workspace and put real secret values in local secrets.
