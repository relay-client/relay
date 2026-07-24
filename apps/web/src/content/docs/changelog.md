---
title: Release notes
description: Notable Relay changes and links to the exact notes for each published release.
---

This page summarizes the notable-change log maintained in the source repository. For the exact notes and artifacts attached to every published tag, use the [Relay releases page](https://github.com/relay-client/relay/releases).

## 1.1.0

### Added

- **CLI runner** — `relay run` executes a YAML workspace's HTTP and GraphQL requests and their JavaScript test scripts from the terminal or CI. Data-driven iterations from a CSV/JSON file (`--data`), `cli`/`json`/`junit` reporters with file export, global and environment variable scopes with export-back, `--verbose`, `--bail`, `--insecure`, and a non-zero exit code when a request errors or an assertion fails. See [CLI runner](/docs/guides/cli-runner/).
- **Client certificates (mutual TLS)** — present a certificate, optional separate key, and passphrase per request or inherited from a collection. See [Per-request settings](/docs/guides/request-settings/#client-certificate-mutual-tls).
- **Dynamic variables** — `{{$guid}}`, `{{$timestamp}}`, `{{$randomEmail}}` and around 50 more under Postman's names, generated at send time. Imported Postman collections that used them no longer fail with an unresolved variable.
- **`.http` / `.rest` import** — files from the JetBrains HTTP Client and the VS Code REST Client, including `###` separators, `# @name` directives, and file variables.
- **Response Timeline tab** — DNS, TCP, TLS and first-byte events on a millisecond scale, connection details (reused or new, addresses, TLS version, cipher, ALPN, SNI), and the request exactly as it went on the wire, one block per redirect hop.
- **Response Diff tab** — compares the current response body against the previous one for the same request, collapsing unchanged runs.
- **Scripting**: `pm.iterationData.get(key)` reads the current data-file row during a data-driven run.

### Changed

- Parallel collection runs take a **Max concurrent requests** setting (default 8, maximum 64).
- Wails updated to 2.13 along with the Go and frontend dependency sets.

### Fixed

- Query parameters keep their order on the wire. They were sorted alphabetically whenever automatic URL encoding was on (the default), breaking APIs that sign the query string verbatim.
- HTTP connections are reused between requests instead of building a fresh transport — and leaking its idle sockets — on every send.
- A parallel collection run no longer fires the entire batch at once, which could exhaust file descriptors on a large collection.

## 1.0.0

First public release. Relay was developed privately until this point; the source is now open under the MIT license and every release is published from the main repository.

### Requests

- All HTTP methods with query parameter, header, and body editors (JSON, form-data, URL-encoded, raw, and binary).
- GraphQL, Server-Sent Events, WebSocket, Socket.IO, and gRPC request types with dedicated realtime panels.
- SSE streams reconnect like a browser `EventSource`, resuming with `Last-Event-ID` and honoring the server's `retry:` interval.
- cURL import by pasting a command into the URL field.
- Importers for Postman, Insomnia, Bruno/OpenCollection, OpenAPI/Swagger, HAR, cURL, and full backups; exporters for Postman, OpenAPI, OpenCollection, and full backups.

### Authentication

- Bearer, Basic, Digest, and API Key schemes.
- OAuth 2.0 Client Credentials and Authorization Code with PKCE — loopback browser sign-in, stored refresh tokens, and automatic refresh before send.
- AWS Signature v4 with specification-compliant query canonicalization.
- Auth defaults inherited from collection and folder level.

### Scripting

- Sandboxed JavaScript pre-request and test scripts with a `pm.*` API, plus the legacy Tengo engine. Imports, filesystem, process, and network access are disabled; execution is capped at 2 seconds.

### Workspaces

- Multiple workspaces, nested collections, drag-and-drop organization, and 14-day request history.
- Git-backed YAML workspaces with diagnostics, conflict helpers, and machine-local secrets.
- Local profile and secrets encrypted at rest with AES-256-GCM, keyed through the OS credential store.

### Response viewer

- Syntax highlighting, full-text search with match navigation, headers, test results, and script logs in one panel.
- Paginated rendering for large bodies with accurate truncation reporting.
- Save to file and copy to clipboard, including byte-exact binary downloads.

### Updates

- Signed auto-updates: `latest.json` is read from release assets, and every downloaded binary must match both the manifest SHA-256 and a minisign signature before installation.

### Interface

- Dark and light themes with several built-in variations.
- Configurable keyboard shortcuts, global search, quick send, and tab switching.
- Settings search and full keyboard navigation, theme previews, and onboarding empty states.
